import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Env } from "../index";
import { verifyAccessToken } from "./jwt";
import { createOAuthState, validateOAuthState } from "./state";
import type { Props } from "./types";

type EnvWithOAuth = Env & { OAUTH_PROVIDER: OAuthHelpers };

function getUpstreamAuthorizeUrl(env: Env, redirectUri: string, state: string) {
  const url = new URL(env.ACCESS_AUTHORIZATION_URL);
  url.searchParams.set("client_id", env.ACCESS_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForTokens(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; idToken: string }> {
  const resp = await fetch(env.ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.ACCESS_CLIENT_ID,
      client_secret: env.ACCESS_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${error}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    id_token: string;
  };
  return { accessToken: data.access_token, idToken: data.id_token };
}

export async function handleAccessRequest(
  request: Request,
  env: EnvWithOAuth,
  _ctx: ExecutionContext,
): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);

  // GET /authorize — redirect to Cloudflare Access
  if (request.method === "GET" && pathname === "/authorize") {
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    if (!oauthReqInfo.clientId) {
      return new Response("Invalid request", { status: 400 });
    }

    const stateToken = await createOAuthState(oauthReqInfo, env.OAUTH_KV);
    const redirectUri = new URL("/callback", request.url).href;
    const authorizeUrl = getUpstreamAuthorizeUrl(env, redirectUri, stateToken);

    return Response.redirect(authorizeUrl, 302);
  }

  // GET /callback — exchange code, verify JWT, complete authorization
  if (request.method === "GET" && pathname === "/callback") {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    let oauthReqInfo: Awaited<ReturnType<typeof validateOAuthState>>;
    try {
      oauthReqInfo = await validateOAuthState(state, env.OAUTH_KV);
    } catch {
      return new Response("Invalid or expired state", { status: 400 });
    }

    const redirectUri = new URL("/callback", request.url).href;
    const { accessToken, idToken } = await exchangeCodeForTokens(
      env,
      code,
      redirectUri,
    );

    const user = await verifyAccessToken(env.ACCESS_JWKS_URL, idToken);

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: user.sub,
      metadata: { label: user.name },
      scope: oauthReqInfo.scope,
      props: {
        accessToken,
        email: user.email,
        name: user.name,
        sub: user.sub,
      } as Props,
    });

    return Response.redirect(redirectTo, 302);
  }

  return new Response("Not Found", { status: 404 });
}

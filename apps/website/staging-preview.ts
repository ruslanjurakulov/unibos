type Environment = Readonly<Record<string, string | undefined>>;

export const stagingBranch = "feat/p4-6-integrated-preview";

export function stagingPreviewHost(env: Environment): string | undefined {
  if (
    env.UNIBOS_STAGING_API !== "1" ||
    env.VERCEL !== "1" ||
    env.VERCEL_ENV !== "preview" ||
    env.VERCEL_GIT_REPO_OWNER !== "ruslanjurakulov" ||
    env.VERCEL_GIT_REPO_SLUG !== "unibos" ||
    env.VERCEL_GIT_COMMIT_REF !== stagingBranch
  )
    return undefined;
  const host = env.VERCEL_BRANCH_URL;
  if (
    !host ||
    !/^[a-z0-9-]+\.vercel\.app$/.test(host) ||
    env.AUTH_BASE_URL !== "https://" + host
  )
    return undefined;
  return host;
}

export function requestStagingOrigin(
  env: Environment,
  requestHost: string | undefined,
) {
  const host = stagingPreviewHost(env);
  return host && requestHost === host ? "https://" + host : undefined;
}

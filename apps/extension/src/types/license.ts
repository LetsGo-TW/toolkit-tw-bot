export type LicenseStatus =
  | 'unknown'
  | 'active'
  | 'warning'
  | 'inactive'
  | 'session-expired'
  | 'error'
  | null

export type LicenseEntitlements = {
  allScripts: boolean
  scripts: Record<string, boolean>
}

export type ExtensionLicenseState = {
  status: LicenseStatus
  allowedByLicense: boolean
  entitlements: LicenseEntitlements
}

export function isLicenseStatusAllowed(status: LicenseStatus = null) {
  return (
    status === null
    || status === 'unknown'
    || status === 'active'
    || status === 'warning'
  )
}

export function createLicenseState({
  status = null,
  entitlements,
}: {
  status?: LicenseStatus
  entitlements?: Partial<LicenseEntitlements>
} = {}): ExtensionLicenseState {
  return {
    status,
    allowedByLicense: isLicenseStatusAllowed(status),
    entitlements: {
      allScripts: entitlements?.allScripts ?? true,
      scripts: entitlements?.scripts ?? {},
    },
  }
}

export function licenseAllowsScript(
  license: ExtensionLicenseState,
  scriptKey: string,
) {
  if (!license.allowedByLicense) {
    return false
  }

  if (license.entitlements.allScripts) {
    return true
  }

  return license.entitlements.scripts[String(scriptKey)] === true
}

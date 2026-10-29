export type CompanyProfile = {
  chineseName: string
  englishName: string
  registrationNumber: string
  addressLine1: string
  addressLine2: string
  phone: string
  mobile: string
  chineseDescription: string
  englishDescription: string
  representativeName: string
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const response = await fetch('/api/company-profile', {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Failed to load company profile.')
  }

  return response.json() as Promise<CompanyProfile>
}
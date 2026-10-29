namespace ShengHengAircon.Api.Options;

public sealed class CompanyProfileOptions
{
    public const string SectionName = "CompanyProfile";

    public string ChineseName { get; set; } = string.Empty;
    public string EnglishName { get; set; } = string.Empty;
    public string RegistrationNumber { get; set; } = string.Empty;

    public string AddressLine1 { get; set; } = string.Empty;
    public string AddressLine2 { get; set; } = string.Empty;

    public string Phone { get; set; } = string.Empty;
    public string Mobile { get; set; } = string.Empty;

    public string ChineseDescription { get; set; } = string.Empty;
    public string EnglishDescription { get; set; } = string.Empty;

    public string RepresentativeName { get; set; } = string.Empty;
}
namespace ShengHengAircon.Api.Features.Auth;

public static class AuthorizationPolicies
{
    public const string Owner = "Owner";
    public const string Management = "Management";
}

public static class UserRoles
{
    public const string Owner = "owner";
    public const string Admin = "admin";
    public const string Employee = "employee";
    public static readonly string[] All = [Owner, Admin, Employee];
}

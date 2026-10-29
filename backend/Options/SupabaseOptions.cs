namespace ShengHengAircon.Api.Options;

public sealed class SupabaseOptions
{
    public const string SectionName = "Supabase";

    public bool Enabled { get; init; }

    public string Url { get; init; } = string.Empty;

    public string ServiceRoleKey { get; init; } = string.Empty;
}

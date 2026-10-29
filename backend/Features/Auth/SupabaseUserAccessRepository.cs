using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Auth;

public sealed class SupabaseUserAccessRepository : IUserAccessRepository
{
    private const string ProfileColumns = "id,email,display_name,role";
    private readonly HttpClient client;

    public SupabaseUserAccessRepository(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled)
            throw new InvalidOperationException("User authentication is unavailable because Supabase is disabled.");

        this.client = client;
        client.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }

    public async Task<AuthUserResponse?> AuthenticateAsync(
        string email, string password, CancellationToken cancellationToken)
    {
        using var response = await client.PostAsJsonAsync(
            "auth/v1/token?grant_type=password",
            new { email = email.Trim(), password }, cancellationToken);
        if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized)
            return null;
        response.EnsureSuccessStatusCode();

        var login = await response.Content.ReadFromJsonAsync<AuthTokenResponse>(cancellationToken)
            ?? throw new HttpRequestException("Supabase returned an unexpected authentication response.");
        return await GetAsync(login.User.Id, cancellationToken)
            ?? throw new UserAccessException("此账号尚未建立应用权限，请联系老板账号。", 403);
    }

    public async Task<IReadOnlyList<AuthUserResponse>> GetAllAsync(CancellationToken cancellationToken) =>
        (await client.GetFromJsonAsync<List<UserProfileRow>>(
            $"rest/v1/user_profiles?select={ProfileColumns}&order=created_at.asc", cancellationToken) ?? [])
        .Select(ToResponse)
        .ToList();

    public async Task<AuthUserResponse?> ChangeRoleAsync(
        Guid id, string role, CancellationToken cancellationToken)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/change_user_role",
            new { p_user_id = id, p_role = role }, cancellationToken);
        if (response.StatusCode == HttpStatusCode.BadRequest)
        {
            var error = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
            var code = error.TryGetProperty("code", out var value) ? value.GetString() : null;
            if (code == "23514")
                throw new UserAccessException("系统必须保留至少一个老板账号。", 409);
        }
        response.EnsureSuccessStatusCode();
        return await GetAsync(id, cancellationToken);
    }

    private async Task<AuthUserResponse?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        (await client.GetFromJsonAsync<List<UserProfileRow>>(
            $"rest/v1/user_profiles?select={ProfileColumns}&id=eq.{id:D}&limit=1", cancellationToken) ?? [])
        .Select(ToResponse)
        .SingleOrDefault();

    private static AuthUserResponse ToResponse(UserProfileRow row) =>
        new(row.Id, row.Email, row.DisplayName, row.Role);

    private sealed record AuthTokenResponse(AuthUser User);
    private sealed record AuthUser(Guid Id);
    private sealed record UserProfileRow(
        Guid Id,
        string Email,
        [property: JsonPropertyName("display_name")] string DisplayName,
        string Role);
}

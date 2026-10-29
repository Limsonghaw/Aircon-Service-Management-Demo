using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Teams;

public sealed class SupabaseTeamRepository : ITeamRepository
{
    private const string Select = "*,employees(*)";
    private readonly HttpClient client;

    public SupabaseTeamRepository(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Team storage is unavailable because Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }

    public async Task<IReadOnlyList<TeamResponse>> GetAllAsync(CancellationToken cancellationToken)
    {
        var rows = await client.GetFromJsonAsync<JsonElement>(
            $"teams?select={Select}&order=is_active.desc,name.asc&employees.order=name.asc", cancellationToken);
        return rows.EnumerateArray().Select(ToTeam).ToList();
    }

    public async Task<TeamResponse> CreateTeamAsync(TeamInput input, CancellationToken cancellationToken)
    {
        var id = await WriteAndGetIdAsync(HttpMethod.Post, "teams", TeamPayload(input), cancellationToken, true);
        return await GetTeamAsync(id!.Value, cancellationToken)
            ?? throw new HttpRequestException("The created team could not be read.");
    }

    public async Task<TeamResponse?> UpdateTeamAsync(Guid id, TeamInput input, CancellationToken cancellationToken)
    {
        var savedId = await WriteAndGetIdAsync(HttpMethod.Patch, $"teams?id=eq.{id:D}", TeamPayload(input), cancellationToken, false);
        return savedId is null ? null : await GetTeamAsync(savedId.Value, cancellationToken);
    }

    public async Task<EmployeeResponse> CreateEmployeeAsync(Guid teamId, EmployeeInput input, CancellationToken cancellationToken)
    {
        var row = await WriteAsync(HttpMethod.Post, "employees", EmployeePayload(input, teamId), cancellationToken, true);
        return ToEmployee(row!.Value);
    }

    public async Task<EmployeeResponse?> UpdateEmployeeAsync(Guid id, EmployeeInput input, CancellationToken cancellationToken)
    {
        var row = await WriteAsync(HttpMethod.Patch, $"employees?id=eq.{id:D}", EmployeePayload(input, input.TeamId), cancellationToken, false);
        return row is null ? null : ToEmployee(row.Value);
    }

    private async Task<TeamResponse?> GetTeamAsync(Guid id, CancellationToken cancellationToken)
    {
        var rows = await client.GetFromJsonAsync<JsonElement>(
            $"teams?select={Select}&id=eq.{id:D}&employees.order=name.asc", cancellationToken);
        return rows.EnumerateArray().Select(ToTeam).SingleOrDefault();
    }

    private async Task<Guid?> WriteAndGetIdAsync(HttpMethod method, string url, object payload,
        CancellationToken cancellationToken, bool requireSingle)
    {
        var row = await WriteAsync(method, url, payload, cancellationToken, requireSingle);
        return row?.GetProperty("id").GetGuid();
    }

    private async Task<JsonElement?> WriteAsync(HttpMethod method, string url, object payload,
        CancellationToken cancellationToken, bool requireSingle)
    {
        using var message = new HttpRequestMessage(method, url) { Content = JsonContent.Create(payload) };
        message.Headers.Add("Prefer", "return=representation");
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.BadRequest)
        {
            var error = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
            var code = error.TryGetProperty("code", out var value) ? value.GetString() : null;
            if (code == "23505") throw new TeamWriteException("团队名称已存在。", 409);
            if (code == "23503") throw new TeamWriteException("所选团队不存在。", 400);
        }
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var first = rows.EnumerateArray().FirstOrDefault();
        if (first.ValueKind != JsonValueKind.Undefined) return first.Clone();
        return requireSingle ? throw new HttpRequestException("Supabase returned an unexpected team response.") : null;
    }

    private static object TeamPayload(TeamInput input) => new
    {
        name = input.Name.Trim(), notes = Normalize(input.Notes), is_active = input.IsActive
    };

    private static object EmployeePayload(EmployeeInput input, Guid? teamId) => new
    {
        team_id = teamId, name = input.Name.Trim(), phone = Normalize(input.Phone),
        role = input.Role.Trim(), notes = Normalize(input.Notes), is_active = input.IsActive
    };

    private static TeamResponse ToTeam(JsonElement row) => new(
        row.GetProperty("id").GetGuid(), row.GetProperty("name").GetString()!,
        OptionalString(row, "notes"), row.GetProperty("is_active").GetBoolean(),
        row.GetProperty("employees").EnumerateArray().Select(ToEmployee).OrderBy(employee => employee.Name).ToList(),
        row.GetProperty("created_at").GetDateTimeOffset(), row.GetProperty("updated_at").GetDateTimeOffset());

    private static EmployeeResponse ToEmployee(JsonElement row) => new(
        row.GetProperty("id").GetGuid(), OptionalGuid(row, "team_id"), row.GetProperty("name").GetString()!,
        OptionalString(row, "phone"), row.GetProperty("role").GetString()!, OptionalString(row, "notes"),
        row.GetProperty("is_active").GetBoolean(), row.GetProperty("created_at").GetDateTimeOffset(),
        row.GetProperty("updated_at").GetDateTimeOffset());

    private static string? OptionalString(JsonElement row, string name) =>
        row.GetProperty(name).ValueKind == JsonValueKind.Null ? null : row.GetProperty(name).GetString();
    private static Guid? OptionalGuid(JsonElement row, string name) =>
        row.GetProperty(name).ValueKind == JsonValueKind.Null ? null : row.GetProperty(name).GetGuid();
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class TeamWriteException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

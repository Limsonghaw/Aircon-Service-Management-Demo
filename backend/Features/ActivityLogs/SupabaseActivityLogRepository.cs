using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.ActivityLogs;

public sealed class SupabaseActivityLogRepository : IActivityLogRepository
{
    private const string Columns =
        "id,action,entity_type,entity_id,entity_label,actor_user_id,actor_name,previous_status,new_status,created_at";
    private readonly HttpClient client;

    public SupabaseActivityLogRepository(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled)
            throw new InvalidOperationException("Activity log storage is unavailable because Supabase is disabled.");

        this.client = client;
        client.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }

    public async Task<IReadOnlyList<ActivityLogResponse>> GetRecentAsync(
        int limit, CancellationToken cancellationToken) =>
        (await client.GetFromJsonAsync<List<ActivityLogRow>>(
            $"activity_logs?select={Columns}&order=created_at.desc,id.desc&limit={limit}", cancellationToken) ?? [])
        .Select(ToResponse)
        .ToList();

    private static ActivityLogResponse ToResponse(ActivityLogRow row) => new(
        row.Id, row.Action, row.EntityType, row.EntityId, row.EntityLabel,
        row.ActorUserId, row.ActorName, row.PreviousStatus, row.NewStatus, row.CreatedAt);

    public async Task<ActivityLogPageResponse> GetPageAsync(ActivityLogQuery query, CancellationToken ct)
    {
        var filters = new List<string> { $"select={Columns}", "order=created_at.desc,id.desc",
            $"limit={query.PageSize}", $"offset={(query.Page - 1) * query.PageSize}" };
        if (!string.IsNullOrEmpty(query.Action)) filters.Add($"action=eq.{Uri.EscapeDataString(query.Action)}");
        if (!string.IsNullOrEmpty(query.EntityType)) filters.Add($"entity_type=eq.{Uri.EscapeDataString(query.EntityType)}");
        // Malaysia dates are inclusive; filter timestamps using the +08:00 boundary.
        if (query.From is { } from) filters.Add("created_at=gte." + Uri.EscapeDataString($"{from:yyyy-MM-dd}T00:00:00+08:00"));
        if (query.To is { } to) filters.Add("created_at=lte." + Uri.EscapeDataString($"{to:yyyy-MM-dd}T23:59:59.999999+08:00"));
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().Replace("\\", "\\\\").Replace("\"", "\\\"")
                .Replace("%", "\\%").Replace("_", "\\_").Replace("*", "\\*");
            filters.Add("or=" + Uri.EscapeDataString($"(entity_label.ilike.\"%{term}%\",actor_name.ilike.\"%{term}%\")"));
        }
        using var request = new HttpRequestMessage(HttpMethod.Get, "activity_logs?" + string.Join("&", filters));
        request.Headers.Add("Prefer", "count=exact");
        using var response = await client.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<ActivityLogRow>>(ct) ?? [];
        // PostgREST sends "0-19/42" without the unit required by .NET's typed header parser.
        var range = response.Content.Headers.TryGetValues("Content-Range", out var values)
            ? values.FirstOrDefault()
            : response.Headers.TryGetValues("Content-Range", out values) ? values.FirstOrDefault() : null;
        if (!long.TryParse(range?.Split('/').Last(), out var total))
            throw new HttpRequestException("Activity log count was not returned.");
        return new(rows.Select(ToResponse).ToList(), total, query.Page, query.PageSize);
    }

    private sealed record ActivityLogRow(
        long Id,
        string Action,
        [property: JsonPropertyName("entity_type")] string EntityType,
        [property: JsonPropertyName("entity_id")] Guid EntityId,
        [property: JsonPropertyName("entity_label")] string EntityLabel,
        [property: JsonPropertyName("actor_user_id")] Guid? ActorUserId,
        [property: JsonPropertyName("actor_name")] string ActorName,
        [property: JsonPropertyName("previous_status")] string? PreviousStatus,
        [property: JsonPropertyName("new_status")] string? NewStatus,
        [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt);
}

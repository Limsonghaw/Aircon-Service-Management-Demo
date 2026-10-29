using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Customers;

public sealed record EmployeeAccountLink(Guid Id, Guid? EmployeeId);
public interface IJobAccessRepository
{
    Task<IReadOnlyList<CustomerJobResponse>> GetEmployeeJobsAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<EmployeeAccountLink>> GetLinksAsync(CancellationToken ct);
    Task<bool> BindEmployeeAsync(Guid userId, Guid? employeeId, CancellationToken ct);
}

public sealed class JobAccessException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class SupabaseJobAccessRepository : IJobAccessRepository
{
    private readonly HttpClient client;
    public SupabaseJobAccessRepository(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Job access storage is unavailable.");
        this.client = client;
        client.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }

    public async Task<IReadOnlyList<CustomerJobResponse>> GetEmployeeJobsAsync(Guid userId, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rpc/get_employee_jobs", new { p_user_id = userId }, ct);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<JobRow>>(ct) ?? [];
        return rows.Select(row => new CustomerJobResponse(row.Id, row.JobNumber, row.CustomerId,
            row.Title, row.ServiceDate, row.Team, row.Status, row.CreatedAt, row.UpdatedAt,
            row.CustomerName)).ToList();
    }

    public async Task<IReadOnlyList<EmployeeAccountLink>> GetLinksAsync(CancellationToken ct) =>
        (await client.GetFromJsonAsync<List<LinkRow>>("user_profiles?select=id,employee_id", ct) ?? [])
        .Select(row => new EmployeeAccountLink(row.Id, row.EmployeeId)).ToList();

    public async Task<bool> BindEmployeeAsync(Guid userId, Guid? employeeId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, $"user_profiles?id=eq.{userId:D}")
        { Content = JsonContent.Create(new { employee_id = employeeId }) };
        request.Headers.Add("Prefer", "return=representation");
        using var response = await client.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.Conflict)
            throw new JobAccessException("此员工已绑定其他账号。", 409);
        if (response.StatusCode == HttpStatusCode.BadRequest)
            throw new JobAccessException("所选员工不存在。", 400);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<LinkRow>>(ct)) is { Count: > 0 };
    }

    private sealed record LinkRow(Guid Id, [property: JsonPropertyName("employee_id")] Guid? EmployeeId);
    private sealed record JobRow(Guid Id,
        [property: JsonPropertyName("job_number")] string JobNumber,
        [property: JsonPropertyName("customer_id")] Guid CustomerId, string Title,
        [property: JsonPropertyName("service_date")] DateOnly ServiceDate, string Team, string Status,
        [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
        [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
        [property: JsonPropertyName("customer_name")] string CustomerName);
}

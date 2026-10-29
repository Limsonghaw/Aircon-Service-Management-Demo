using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Customers;

public sealed class SupabaseCustomerRepository : ICustomerRepository
{
    private const string SelectColumns =
        "id,name,customer_type,phone,email,address,notes,created_at,updated_at";

    private readonly HttpClient _httpClient;

    public SupabaseCustomerRepository(
        HttpClient httpClient,
        IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            throw new InvalidOperationException(
                "Customer storage is unavailable because Supabase is disabled.");
        }

        _httpClient = httpClient;
        _httpClient.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        _httpClient.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);

        // Legacy service_role keys are JWTs and may be sent as Bearer tokens.
        // New sb_secret_ keys are API keys and must only use the apikey header.
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
        {
            _httpClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue(
                    "Bearer",
                    settings.ServiceRoleKey);
        }
    }

    public async Task<IReadOnlyList<CustomerResponse>> GetAllAsync(
        CancellationToken cancellationToken)
    {
        var rows = await _httpClient.GetFromJsonAsync<List<CustomerRow>>(
            $"customers?select={SelectColumns}&order=name.asc",
            cancellationToken) ?? [];

        return rows.Select(ToResponse).ToList();
    }

    public async Task<CustomerResponse?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken)
    {
        var rows = await _httpClient.GetFromJsonAsync<List<CustomerRow>>(
            $"customers?select={SelectColumns}&id=eq.{id:D}&limit=1",
            cancellationToken) ?? [];

        return rows.Count == 0 ? null : ToResponse(rows[0]);
    }

    public async Task<IReadOnlyList<CustomerJobResponse>> GetJobsAsync(
        Guid customerId,
        CancellationToken cancellationToken)
    {
        const string columns =
            "id,job_number,customer_id,title,service_date,team,status,created_at,updated_at";
        var rows = await _httpClient.GetFromJsonAsync<List<CustomerJobRow>>(
            $"jobs?select={columns}&customer_id=eq.{customerId:D}&order=service_date.desc",
            cancellationToken) ?? [];

        return rows.Select(row => new CustomerJobResponse(
            row.Id,
            row.JobNumber,
            row.CustomerId,
            row.Title,
            row.ServiceDate,
            row.Team,
            row.Status,
            row.CreatedAt,
            row.UpdatedAt)).ToList();
    }

    public async Task<CustomerJobResponse> CreateJobAsync(
        Guid customerId,
        CreateCustomerJobRequest request,
        CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "jobs")
        {
            Content = JsonContent.Create(new CustomerJobWriteRow(
                request.JobNumber.Trim(),
                customerId,
                request.Title.Trim(),
                request.ServiceDate,
                request.Team.Trim(),
                request.Status))
        };
        message.Headers.Add("Prefer", "return=representation");

        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<CustomerJobRow>>(
            cancellationToken);
        var row = rows is { Count: 1 }
            ? rows[0]
            : throw new HttpRequestException(
                "Supabase returned an unexpected job response.",
                null,
                HttpStatusCode.BadGateway);

        return new CustomerJobResponse(
            row.Id,
            row.JobNumber,
            row.CustomerId,
            row.Title,
            row.ServiceDate,
            row.Team,
            row.Status,
            row.CreatedAt,
            row.UpdatedAt);
    }

    public async Task<IReadOnlyList<CustomerJobResponse>> GetAllJobsAsync(
        CancellationToken cancellationToken)
    {
        const string columns =
            "id,job_number,customer_id,title,service_date,team,status,created_at,updated_at";
        var rows = await _httpClient.GetFromJsonAsync<List<CustomerJobRow>>(
            $"jobs?select={columns}&order=service_date.desc",
            cancellationToken) ?? [];

        return rows.Select(ToJobResponse).ToList();
    }

    public async Task<CustomerJobResponse?> UpdateJobAsync(
        Guid id,
        UpdateCustomerJobRequest request,
        CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(HttpMethod.Patch, $"jobs?id=eq.{id:D}")
        {
            Content = JsonContent.Create(new CustomerJobUpdateRow(
                request.JobNumber.Trim(),
                request.Title.Trim(),
                request.ServiceDate,
                request.Team.Trim(),
                request.Status))
        };
        message.Headers.Add("Prefer", "return=representation");

        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<CustomerJobRow>>(cancellationToken);
        return rows is { Count: > 0 } ? ToJobResponse(rows[0]) : null;
    }

    public async Task<bool> DeleteJobAsync(Guid id, CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(HttpMethod.Delete, $"jobs?id=eq.{id:D}");
        message.Headers.Add("Prefer", "return=representation");

        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<CustomerJobRow>>(cancellationToken);
        return rows is { Count: > 0 };
    }

    public async Task<CustomerResponse> CreateAsync(
        CreateCustomerRequest request,
        CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "customers")
        {
            Content = JsonContent.Create(ToWriteRow(request))
        };
        message.Headers.Add("Prefer", "return=representation");

        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        return ToResponse(await ReadSingleRowAsync(response, cancellationToken));
    }

    public async Task<CustomerResponse?> UpdateAsync(
        Guid id,
        UpdateCustomerRequest request,
        CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(
            HttpMethod.Patch,
            $"customers?id=eq.{id:D}")
        {
            Content = JsonContent.Create(ToWriteRow(request))
        };
        message.Headers.Add("Prefer", "return=representation");

        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<CustomerRow>>(cancellationToken);
        return rows is null || rows.Count == 0 ? null : ToResponse(rows[0]);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(
            HttpMethod.Delete,
            $"customers?id=eq.{id:D}");
        message.Headers.Add("Prefer", "return=representation");

        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<CustomerRow>>(cancellationToken);
        return rows is { Count: > 0 };
    }

    private static async Task<CustomerRow> ReadSingleRowAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        var rows = await response.Content.ReadFromJsonAsync<List<CustomerRow>>(cancellationToken);
        return rows is { Count: 1 }
            ? rows[0]
            : throw new HttpRequestException(
                "Supabase returned an unexpected customer response.",
                null,
                HttpStatusCode.BadGateway);
    }

    private static CustomerWriteRow ToWriteRow(CreateCustomerRequest request) => new(
        request.Name.Trim(),
        ToDatabaseValue(request.CustomerType),
        request.Phone.Trim(),
        NormalizeOptional(request.Email),
        NormalizeOptional(request.Address),
        NormalizeOptional(request.Notes));

    private static CustomerWriteRow ToWriteRow(UpdateCustomerRequest request) => new(
        request.Name.Trim(),
        ToDatabaseValue(request.CustomerType),
        request.Phone.Trim(),
        NormalizeOptional(request.Email),
        NormalizeOptional(request.Address),
        NormalizeOptional(request.Notes));

    private static CustomerResponse ToResponse(CustomerRow row) => new(
        row.Id,
        row.Name,
        row.CustomerType == "business" ? CustomerType.Business : CustomerType.Individual,
        row.Phone,
        row.Email,
        row.Address,
        row.Notes,
        row.CreatedAt,
        row.UpdatedAt);

    private static CustomerJobResponse ToJobResponse(CustomerJobRow row) => new(
        row.Id,
        row.JobNumber,
        row.CustomerId,
        row.Title,
        row.ServiceDate,
        row.Team,
        row.Status,
        row.CreatedAt,
        row.UpdatedAt);

    private static string ToDatabaseValue(CustomerType type) =>
        type == CustomerType.Business ? "business" : "individual";

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record CustomerWriteRow(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("customer_type")] string CustomerType,
        [property: JsonPropertyName("phone")] string Phone,
        [property: JsonPropertyName("email")] string? Email,
        [property: JsonPropertyName("address")] string? Address,
        [property: JsonPropertyName("notes")] string? Notes);

    private sealed record CustomerRow(
        [property: JsonPropertyName("id")] Guid Id,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("customer_type")] string CustomerType,
        [property: JsonPropertyName("phone")] string Phone,
        [property: JsonPropertyName("email")] string? Email,
        [property: JsonPropertyName("address")] string? Address,
        [property: JsonPropertyName("notes")] string? Notes,
        [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
        [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

    private sealed record CustomerJobRow(
        [property: JsonPropertyName("id")] Guid Id,
        [property: JsonPropertyName("job_number")] string JobNumber,
        [property: JsonPropertyName("customer_id")] Guid CustomerId,
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("service_date")] DateOnly ServiceDate,
        [property: JsonPropertyName("team")] string Team,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
        [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

    private sealed record CustomerJobWriteRow(
        [property: JsonPropertyName("job_number")] string JobNumber,
        [property: JsonPropertyName("customer_id")] Guid CustomerId,
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("service_date")] DateOnly ServiceDate,
        [property: JsonPropertyName("team")] string Team,
        [property: JsonPropertyName("status")] string Status);

    private sealed record CustomerJobUpdateRow(
        [property: JsonPropertyName("job_number")] string JobNumber,
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("service_date")] DateOnly ServiceDate,
        [property: JsonPropertyName("team")] string Team,
        [property: JsonPropertyName("status")] string Status);
}

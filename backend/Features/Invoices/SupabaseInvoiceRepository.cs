using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Invoices;

public sealed class SupabaseInvoiceRepository : IInvoiceRepository
{
    private const string SelectColumns =
        "id,invoice_number,customer_id,amount,due_date,status,notes,created_at,updated_at,items,discount,customers(name)";
    private readonly HttpClient _httpClient;

    public SupabaseInvoiceRepository(HttpClient httpClient, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            throw new InvalidOperationException("Invoice storage is unavailable because Supabase is disabled.");
        }

        _httpClient = httpClient;
        _httpClient.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        _httpClient.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
        {
            _httpClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.ServiceRoleKey);
        }
    }

    public async Task<IReadOnlyList<InvoiceResponse>> GetAllAsync(CancellationToken cancellationToken)
    {
        var rows = await _httpClient.GetFromJsonAsync<List<InvoiceRow>>(
            $"invoices?select={SelectColumns}&order=due_date.desc",
            cancellationToken) ?? [];
        return rows.Select(ToResponse).ToList();
    }

    public async Task<InvoiceResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var rows = await _httpClient.GetFromJsonAsync<List<InvoiceRow>>(
            $"invoices?select={SelectColumns}&id=eq.{id:D}&limit=1",
            cancellationToken) ?? [];
        return rows.Count == 0 ? null : ToResponse(rows[0]);
    }

    public async Task<InvoiceResponse> CreateAsync(
        CreateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var row = await WriteAsync(HttpMethod.Post, "invoices", ToWriteRow(request), cancellationToken);
        return await GetByIdAsync(row!.Id, cancellationToken)
            ?? throw new HttpRequestException("The created invoice could not be read.", null, HttpStatusCode.BadGateway);
    }

    public async Task<InvoiceResponse?> UpdateAsync(
        Guid id,
        UpdateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var row = await WriteAsync(HttpMethod.Patch, $"invoices?id=eq.{id:D}", ToWriteRow(request), cancellationToken, false);
        return row is null ? null : await GetByIdAsync(row.Id, cancellationToken);
    }

    private async Task<InvoiceWriteResult?> WriteAsync(
        HttpMethod method,
        string url,
        InvoiceWriteRow content,
        CancellationToken cancellationToken,
        bool requireSingle = true)
    {
        using var message = new HttpRequestMessage(method, url) { Content = JsonContent.Create(content) };
        message.Headers.Add("Prefer", "return=representation");
        using var response = await _httpClient.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<InvoiceWriteResult>>(cancellationToken);
        if (rows is { Count: > 0 }) return rows[0];
        if (!requireSingle) return null;
        throw new HttpRequestException("Supabase returned an unexpected invoice response.", null, HttpStatusCode.BadGateway);
    }

    private static InvoiceWriteRow ToWriteRow(CreateInvoiceRequest request) => new(
        request.InvoiceNumber.Trim(), request.CustomerId, request.Amount, request.DueDate,
        ToDatabaseValue(request.Status), NormalizeOptional(request.Notes), request.Items, request.Discount);

    private static InvoiceWriteRow ToWriteRow(UpdateInvoiceRequest request) => new(
        request.InvoiceNumber.Trim(), request.CustomerId, request.Amount, request.DueDate,
        ToDatabaseValue(request.Status), NormalizeOptional(request.Notes), request.Items, request.Discount);

    private static InvoiceResponse ToResponse(InvoiceRow row) => new(
        row.Id, row.InvoiceNumber, row.CustomerId, row.Customers.Name, row.Amount,
        row.DueDate, FromDatabaseValue(row.Status), row.Notes, row.CreatedAt, row.UpdatedAt, row.Items, row.Discount);

    private static string ToDatabaseValue(InvoiceStatus status) => status switch
    {
        InvoiceStatus.Partial => "partial",
        InvoiceStatus.Paid => "paid",
        InvoiceStatus.Overdue => "overdue",
        _ => "unpaid"
    };

    private static InvoiceStatus FromDatabaseValue(string status) => status switch
    {
        "partial" => InvoiceStatus.Partial,
        "paid" => InvoiceStatus.Paid,
        "overdue" => InvoiceStatus.Overdue,
        _ => InvoiceStatus.Unpaid
    };

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private sealed record InvoiceWriteRow(
        [property: JsonPropertyName("invoice_number")] string InvoiceNumber,
        [property: JsonPropertyName("customer_id")] Guid CustomerId,
        [property: JsonPropertyName("amount")] decimal Amount,
        [property: JsonPropertyName("due_date")] DateOnly DueDate,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("notes")] string? Notes,
        [property: JsonPropertyName("items")] IReadOnlyList<InvoiceItem> Items,
        [property: JsonPropertyName("discount")] decimal Discount);

    private sealed record InvoiceWriteResult([property: JsonPropertyName("id")] Guid Id);
    private sealed record CustomerReference([property: JsonPropertyName("name")] string Name);
    private sealed record InvoiceRow(
        [property: JsonPropertyName("id")] Guid Id,
        [property: JsonPropertyName("invoice_number")] string InvoiceNumber,
        [property: JsonPropertyName("customer_id")] Guid CustomerId,
        [property: JsonPropertyName("amount")] decimal Amount,
        [property: JsonPropertyName("due_date")] DateOnly DueDate,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("notes")] string? Notes,
        [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
        [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
        [property: JsonPropertyName("customers")] CustomerReference Customers,
        [property: JsonPropertyName("items")] List<InvoiceItem>? Items,
        [property: JsonPropertyName("discount")] decimal Discount);
}

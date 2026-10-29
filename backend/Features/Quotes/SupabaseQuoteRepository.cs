using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Quotes;

public sealed class SupabaseQuoteRepository : IQuoteRepository
{
    private readonly HttpClient client;
    private const string Select = "*,customers(name),quote_items(*),invoices(id),jobs(id)";
    public SupabaseQuoteRepository(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }
    public async Task<IReadOnlyList<QuoteResponse>> GetAllAsync(CancellationToken ct) =>
        await ReadAsync($"quotes?select={Select}&order=created_at.desc,id.asc", ct);
    public async Task<QuoteResponse?> GetAsync(Guid id, CancellationToken ct) =>
        (await ReadAsync($"quotes?select={Select}&id=eq.{id:D}", ct)).SingleOrDefault();
    public async Task<QuoteResponse?> UpdateStatusAsync(Guid id, string status, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, $"quotes?id=eq.{id:D}")
        { Content = JsonContent.Create(new { status }) };
        request.Headers.Add("Prefer", "return=representation");
        using var response = await client.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        return rows.GetArrayLength() == 0 ? null : await GetAsync(id, ct)
            ?? throw new HttpRequestException("Unable to read updated quote.");
    }
    public async Task<QuoteResponse?> SaveAsync(Guid? id, QuoteInput input, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rpc/save_quote", new {
            p_id = id, p_quote_number = input.QuoteNumber.Trim(), p_customer_id = input.CustomerId,
            p_valid_until = input.ValidUntil, p_status = input.Status,
            p_notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(), p_items = input.Items
        }, ct);
        if (response.StatusCode == HttpStatusCode.Conflict || response.StatusCode == HttpStatusCode.BadRequest)
        {
            var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
            var code = error.TryGetProperty("code", out var value) ? value.GetString() : null;
            if (code == "23505") throw new QuoteWriteException("报价编号已存在。", 409);
            if (code == "23503") throw new QuoteWriteException("客户不存在，请重新选择。", 400);
            if (code == "23514") throw new QuoteWriteException("报价资料不符合要求。", 400);
        }
        response.EnsureSuccessStatusCode();
        var savedId = await response.Content.ReadFromJsonAsync<Guid?>(ct);
        return savedId is null ? null : await GetAsync(savedId.Value, ct)
            ?? throw new HttpRequestException("Unable to read saved quote.");
    }
    public Task<Guid?> ConvertToInvoiceAsync(Guid id, ConvertQuoteToInvoiceRequest input, CancellationToken ct) =>
        ConvertAsync("rpc/convert_quote_to_invoice", new
        {
            p_quote_id = id, p_invoice_number = input.InvoiceNumber.Trim(), p_due_date = input.DueDate
        }, "发票编号已存在，或此报价已经转换成发票。", ct);

    public Task<Guid?> ConvertToJobAsync(Guid id, ConvertQuoteToJobRequest input, CancellationToken ct) =>
        ConvertAsync("rpc/convert_quote_to_job", new
        {
            p_quote_id = id, p_job_number = input.JobNumber.Trim(), p_title = input.Title.Trim(),
            p_service_date = input.ServiceDate, p_team = input.Team.Trim()
        }, "工作单编号已存在，或此报价已经转换成工作单。", ct);

    private async Task<Guid?> ConvertAsync(string url, object payload, string conflictMessage, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync(url, payload, ct);
        if (response.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.BadRequest)
        {
            var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
            var code = error.TryGetProperty("code", out var value) ? value.GetString() : null;
            if (code == "23505") throw new QuoteWriteException(conflictMessage, 409);
            if (code == "23514") throw new QuoteWriteException("只有已接受且总额大于零的报价可以转换。", 400);
        }
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Guid?>(ct);
    }
    private async Task<List<QuoteResponse>> ReadAsync(string url, CancellationToken ct)
    {
        var rows = await client.GetFromJsonAsync<JsonElement>(url, ct);
        return rows.EnumerateArray().Select(row => new QuoteResponse(
            row.GetProperty("id").GetGuid(), row.GetProperty("quote_number").GetString()!,
            row.GetProperty("customer_id").GetGuid(), row.GetProperty("customers").GetProperty("name").GetString()!,
            DateOnly.Parse(row.GetProperty("valid_until").GetString()!), row.GetProperty("status").GetString()!,
            row.GetProperty("notes").GetString(),
            row.GetProperty("quote_items").EnumerateArray().OrderBy(item => item.GetProperty("position").GetInt32())
                .Select(item => new QuoteItemResponse(item.GetProperty("id").GetGuid(),
                    item.GetProperty("description").GetString()!, item.GetProperty("quantity").GetDecimal(),
                    item.GetProperty("unit_price").GetDecimal())).ToList(),
            FirstRelatedId(row, "invoices"), FirstRelatedId(row, "jobs"))).ToList();
    }

    private static Guid? FirstRelatedId(JsonElement row, string property)
    {
        var related = row.GetProperty(property).EnumerateArray().FirstOrDefault();
        return related.ValueKind == JsonValueKind.Undefined ? null : related.GetProperty("id").GetGuid();
    }
}
public sealed class QuoteWriteException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

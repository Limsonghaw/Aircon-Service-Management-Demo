using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Expenses;

public sealed class SupabaseExpenseRepository : IExpenseRepository
{
    private const string Columns =
        "id,expense_number,description,amount,expense_date,status,notes,created_at,updated_at";
    private readonly HttpClient client;

    public SupabaseExpenseRepository(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Expense storage is unavailable because Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri($"{settings.Url.TrimEnd('/')}/rest/v1/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }

    public async Task<IReadOnlyList<ExpenseResponse>> GetAllAsync(CancellationToken cancellationToken) =>
        (await client.GetFromJsonAsync<List<ExpenseRow>>(
            $"expenses?select={Columns}&order=expense_date.desc,created_at.desc", cancellationToken) ?? [])
        .Select(ToResponse).ToList();

    public async Task<ExpenseResponse?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        (await client.GetFromJsonAsync<List<ExpenseRow>>(
            $"expenses?select={Columns}&id=eq.{id:D}&limit=1", cancellationToken) ?? [])
        .Select(ToResponse).SingleOrDefault();

    public async Task<ExpenseResponse> CreateAsync(ExpenseInput input, CancellationToken cancellationToken)
    {
        var row = await WriteAsync(HttpMethod.Post, "expenses", input, cancellationToken, true);
        return row is null
            ? throw new HttpRequestException("Supabase returned an unexpected expense response.", null, HttpStatusCode.BadGateway)
            : ToResponse(row);
    }

    public async Task<ExpenseResponse?> UpdateAsync(Guid id, ExpenseInput input, CancellationToken cancellationToken)
    {
        var row = await WriteAsync(HttpMethod.Patch, $"expenses?id=eq.{id:D}", input, cancellationToken, false);
        return row is null ? null : ToResponse(row);
    }

    private async Task<ExpenseRow?> WriteAsync(
        HttpMethod method, string url, ExpenseInput input, CancellationToken cancellationToken, bool requireSingle)
    {
        using var message = new HttpRequestMessage(method, url)
        {
            Content = JsonContent.Create(new ExpenseWriteRow(
                input.ExpenseNumber.Trim(), input.Description.Trim(), input.Amount,
                input.ExpenseDate, input.Status,
                string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim()))
        };
        message.Headers.Add("Prefer", "return=representation");
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Conflict)
            throw new ExpenseWriteException("费用编号已存在。", 409);
        response.EnsureSuccessStatusCode();
        var rows = await response.Content.ReadFromJsonAsync<List<ExpenseRow>>(cancellationToken);
        if (rows is { Count: > 0 }) return rows[0];
        return requireSingle
            ? throw new HttpRequestException("Supabase returned an unexpected expense response.")
            : null;
    }

    private static ExpenseResponse ToResponse(ExpenseRow row) => new(
        row.Id, row.ExpenseNumber, row.Description, row.Amount, row.ExpenseDate,
        row.Status, row.Notes, row.CreatedAt, row.UpdatedAt);

    private sealed record ExpenseWriteRow(
        [property: JsonPropertyName("expense_number")] string ExpenseNumber,
        [property: JsonPropertyName("description")] string Description,
        [property: JsonPropertyName("amount")] decimal Amount,
        [property: JsonPropertyName("expense_date")] DateOnly ExpenseDate,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("notes")] string? Notes);

    private sealed record ExpenseRow(
        [property: JsonPropertyName("id")] Guid Id,
        [property: JsonPropertyName("expense_number")] string ExpenseNumber,
        [property: JsonPropertyName("description")] string Description,
        [property: JsonPropertyName("amount")] decimal Amount,
        [property: JsonPropertyName("expense_date")] DateOnly ExpenseDate,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("notes")] string? Notes,
        [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
        [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);
}

public sealed class ExpenseWriteException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

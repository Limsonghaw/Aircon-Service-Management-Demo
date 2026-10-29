using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Quotes;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class QuotesContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task SaveAndReadQuote_PreservesItemsStatusAndRoundedTotals()
    {
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IQuoteRepository>();
            services.AddSingleton<IQuoteRepository>(new FakeRepository());
        }));
        using var client = app.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var input = ValidInput();
        using var createdResponse = await client.PostAsJsonAsync("/api/quotes", input, ct);
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = await createdResponse.Content.ReadFromJsonAsync<QuoteResponse>(ct);
        Assert.NotNull(created);
        Assert.Equal(0.02m, created.Total);
        Assert.Equal(0.01m, created.Items[0].Subtotal);
        input.Status = "accepted";
        input.Items.RemoveAt(1);
        using var updatedResponse = await client.PutAsJsonAsync($"/api/quotes/{created.Id}", input, ct);
        Assert.Equal(HttpStatusCode.OK, updatedResponse.StatusCode);
        var read = await client.GetFromJsonAsync<QuoteResponse>($"/api/quotes/{created.Id}", ct);
        Assert.Equal("accepted", read!.Status);
        Assert.Single(read.Items);
        Assert.Equal(0.01m, read.Total);

        using var invoiceResponse = await client.PostAsJsonAsync($"/api/quotes/{created.Id}/invoice", new
        {
            invoiceNumber = "INV-TEST", dueDate = "2026-11-20"
        }, ct);
        using var jobResponse = await client.PostAsJsonAsync($"/api/quotes/{created.Id}/job", new
        {
            jobNumber = "JOB-TEST", title = "Installation", serviceDate = "2026-11-01", team = "未安排"
        }, ct);
        Assert.Equal(HttpStatusCode.Created, invoiceResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, jobResponse.StatusCode);
        var converted = await client.GetFromJsonAsync<QuoteResponse>($"/api/quotes/{created.Id}", ct);
        Assert.NotNull(converted?.InvoiceId);
        Assert.NotNull(converted?.JobId);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/quotes/{Guid.NewGuid()}", ct)).StatusCode);
    }

    [Theory]
    [InlineData("empty")]
    [InlineData("negative")]
    [InlineData("precision")]
    [InlineData("customer")]
    [InlineData("date")]
    [InlineData("status")]
    public async Task InvalidInput_IsRejectedBeforeStorage(string invalid)
    {
        var repository = new FakeRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IQuoteRepository>();
            services.AddSingleton<IQuoteRepository>(repository);
        }));
        using var client = app.CreateClient();
        var input = ValidInput();
        switch (invalid)
        {
            case "empty": input.Items.Clear(); break;
            case "negative": input.Items[0].UnitPrice = -1; break;
            case "precision": input.Items[0].Quantity = 1.001m; break;
            case "customer": input.CustomerId = Guid.Empty; break;
            case "date": input.ValidUntil = default; break;
            case "status": input.Status = "invalid"; break;
        }
        using var response = await client.PostAsJsonAsync("/api/quotes", input, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(repository.Quote);
    }
    [Theory]
    [InlineData("draft")]
    [InlineData("sent")]
    [InlineData("accepted")]
    [InlineData("rejected")]
    public async Task StatusUpdate_PreservesQuoteFieldsAndRejectsInvalidOrUnauthorizedWrites(string status)
    {
        var repository = new FakeRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IQuoteRepository>();
            services.AddSingleton<IQuoteRepository>(repository);
        }));
        using var client = app.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var quote = await repository.SaveAsync(null, ValidInput(), ct);
        using var response = await client.PatchAsJsonAsync($"/api/quotes/{quote!.Id}/status", new { status }, ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await response.Content.ReadFromJsonAsync<QuoteResponse>(ct);
        Assert.Equal(status, saved!.Status);
        Assert.Equal(quote with { Status = status }, repository.Quote);
        using var invalid = await client.PatchAsJsonAsync($"/api/quotes/{quote.Id}/status", new { status = "invalid" }, ct);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var missing = await client.PatchAsJsonAsync($"/api/quotes/{Guid.NewGuid()}/status", new { status }, ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Role", "employee");
        using var forbidden = await client.PatchAsJsonAsync($"/api/quotes/{quote.Id}/status", new { status = "sent" }, ct);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal(status, repository.Quote!.Status);
    }

    private static QuoteInput ValidInput() => new()
    {
        QuoteNumber = "QT-TEST", CustomerId = Guid.NewGuid(), ValidUntil = new(2026, 10, 20),
        Items = [new() { Description = "A", Quantity = 0.5m, UnitPrice = 0.01m },
            new() { Description = "B", Quantity = 0.5m, UnitPrice = 0.01m }]
    };
    private sealed class FakeRepository : IQuoteRepository
    {
        public QuoteResponse? Quote { get; private set; }
        public Task<QuoteResponse?> UpdateStatusAsync(Guid id, string status, CancellationToken ct)
        {
            if (Quote?.Id != id) return Task.FromResult<QuoteResponse?>(null);
            Quote = Quote with { Status = status };
            return Task.FromResult<QuoteResponse?>(Quote);
        }
        public Task<IReadOnlyList<QuoteResponse>> GetAllAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<QuoteResponse>>(Quote is null ? [] : [Quote]);
        public Task<QuoteResponse?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Quote?.Id == id ? Quote : null);
        public Task<QuoteResponse?> SaveAsync(Guid? id, QuoteInput input, CancellationToken ct)
        {
            Quote = new(id ?? Guid.NewGuid(), input.QuoteNumber, input.CustomerId, "Customer", input.ValidUntil,
                input.Status, input.Notes, input.Items.Select(item => new QuoteItemResponse(Guid.NewGuid(),
                    item.Description, item.Quantity, item.UnitPrice)).ToList());
            return Task.FromResult<QuoteResponse?>(Quote);
        }
        public Task<Guid?> ConvertToInvoiceAsync(Guid id, ConvertQuoteToInvoiceRequest input, CancellationToken ct)
        {
            if (Quote?.Id != id) return Task.FromResult<Guid?>(null);
            var invoiceId = Guid.NewGuid();
            Quote = Quote with { InvoiceId = invoiceId };
            return Task.FromResult<Guid?>(invoiceId);
        }
        public Task<Guid?> ConvertToJobAsync(Guid id, ConvertQuoteToJobRequest input, CancellationToken ct)
        {
            if (Quote?.Id != id) return Task.FromResult<Guid?>(null);
            var jobId = Guid.NewGuid();
            Quote = Quote with { JobId = jobId };
            return Task.FromResult<Guid?>(jobId);
        }
    }
}

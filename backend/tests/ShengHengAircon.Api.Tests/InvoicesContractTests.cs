using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Invoices;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class InvoicesContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions ApiJsonOptions = CreateApiJsonOptions();

    [Fact]
    public async Task InvoiceEndpoints_ProvideCreateListAndUpdateResponses()
    {
        var repository = new FakeInvoiceRepository();
        await using var invoiceFactory = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IInvoiceRepository>();
                services.AddSingleton<IInvoiceRepository>(repository);
            }));
        using var client = invoiceFactory.CreateClient();
        var cancellationToken = TestContext.Current.CancellationToken;
        var customerId = Guid.NewGuid();

        var createResponse = await client.PostAsJsonAsync("/api/invoices", new
        {
            invoiceNumber = "INV-TEST-001",
            customerId,
            amount = 2880.50m,
            dueDate = "2026-10-20",
            status = "unpaid",
            notes = "Test invoice"
        }, cancellationToken);
        var created = await createResponse.Content.ReadFromJsonAsync<InvoiceResponse>(ApiJsonOptions, cancellationToken);

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        Assert.NotNull(created);
        Assert.EndsWith($"/api/invoices/{created.Id}", createResponse.Headers.Location?.ToString());

        var list = await client.GetFromJsonAsync<List<InvoiceResponse>>("/api/invoices", ApiJsonOptions, cancellationToken);
        Assert.Single(list!);

        var updateResponse = await client.PutAsJsonAsync($"/api/invoices/{created.Id}", new
        {
            invoiceNumber = "INV-TEST-001",
            customerId,
            amount = 2880.50m,
            dueDate = "2026-10-20",
            status = "paid",
            notes = "Paid"
        }, cancellationToken);
        var updated = await updateResponse.Content.ReadFromJsonAsync<InvoiceResponse>(ApiJsonOptions, cancellationToken);

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        Assert.Equal(InvoiceStatus.Paid, updated?.Status);
    }

    [Fact]
    public async Task CreateInvoice_ReturnsValidationProblemForInvalidBody()
    {
        var repository = new FakeInvoiceRepository();
        await using var invoiceFactory = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IInvoiceRepository>();
                services.AddSingleton<IInvoiceRepository>(repository);
            }));
        using var client = invoiceFactory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/invoices", new
        {
            invoiceNumber = "",
            customerId = Guid.NewGuid(),
            amount = 0,
            dueDate = "2026-10-20",
            status = "unpaid",
            notes = (string?)null
        }, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(repository.Invoices);
    }

    [Theory]
    [InlineData(100, 100, 1)]
    [InlineData(100, 0, 1.001)]
    [InlineData(100, 0.001, 1)]
    public async Task InvalidInvoiceItems_AreRejectedBeforeStorage(decimal price, decimal discount, decimal quantity)
    {
        var repository = new FakeInvoiceRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IInvoiceRepository>();
            services.AddSingleton<IInvoiceRepository>(repository);
        }));
        using var client = app.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/invoices", new {
            invoiceNumber = "INV-DOC", customerId = Guid.NewGuid(), amount = 100,
            dueDate = "2026-10-20", status = "unpaid", discount,
            items = new[] { new { description = "Service", quantity, unitPrice = price } }
        }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(repository.Invoices);
    }

    private static JsonSerializerOptions CreateApiJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, false));
        return options;
    }

    private sealed class FakeInvoiceRepository : IInvoiceRepository
    {
        public List<InvoiceResponse> Invoices { get; } = [];

        public Task<IReadOnlyList<InvoiceResponse>> GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<InvoiceResponse>>(Invoices);

        public Task<InvoiceResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
            Task.FromResult(Invoices.SingleOrDefault(invoice => invoice.Id == id));

        public Task<InvoiceResponse> CreateAsync(CreateInvoiceRequest request, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var invoice = new InvoiceResponse(
                Guid.NewGuid(), request.InvoiceNumber, request.CustomerId, "Test Customer",
                request.Amount, request.DueDate, request.Status, request.Notes, now, now);
            Invoices.Add(invoice);
            return Task.FromResult(invoice);
        }

        public Task<InvoiceResponse?> UpdateAsync(
            Guid id,
            UpdateInvoiceRequest request,
            CancellationToken cancellationToken)
        {
            var index = Invoices.FindIndex(invoice => invoice.Id == id);
            if (index < 0) return Task.FromResult<InvoiceResponse?>(null);
            var updated = Invoices[index] with
            {
                InvoiceNumber = request.InvoiceNumber,
                CustomerId = request.CustomerId,
                Amount = request.Amount,
                DueDate = request.DueDate,
                Status = request.Status,
                Notes = request.Notes,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            Invoices[index] = updated;
            return Task.FromResult<InvoiceResponse?>(updated);
        }
    }
}

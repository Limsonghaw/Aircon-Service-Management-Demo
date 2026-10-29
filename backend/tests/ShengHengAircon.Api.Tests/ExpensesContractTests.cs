using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Expenses;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class ExpensesContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task ExpenseEndpoints_CreateListAndUpdateStatus()
    {
        var repository = new FakeExpenseRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IExpenseRepository>();
            services.AddSingleton<IExpenseRepository>(repository);
        }));
        using var client = app.CreateClient();
        var cancellationToken = TestContext.Current.CancellationToken;

        using var createResponse = await client.PostAsJsonAsync("/api/expenses", ValidInput(), cancellationToken);
        var created = await createResponse.Content.ReadFromJsonAsync<ExpenseResponse>(cancellationToken);

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        Assert.NotNull(created);
        Assert.EndsWith($"/api/expenses/{created.Id}", createResponse.Headers.Location?.ToString());

        var list = await client.GetFromJsonAsync<List<ExpenseResponse>>("/api/expenses", cancellationToken);
        Assert.Single(list!);

        var update = ValidInput();
        update.Status = "confirmed";
        using var updateResponse = await client.PutAsJsonAsync(
            $"/api/expenses/{created.Id}", update, cancellationToken);
        var updated = await updateResponse.Content.ReadFromJsonAsync<ExpenseResponse>(cancellationToken);

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        Assert.Equal("confirmed", updated?.Status);
    }

    [Fact]
    public async Task CreateExpense_RejectsInvalidAmountBeforeStorage()
    {
        var repository = new FakeExpenseRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IExpenseRepository>();
            services.AddSingleton<IExpenseRepository>(repository);
        }));
        using var client = app.CreateClient();
        var input = ValidInput();
        input.Amount = 0;

        using var response = await client.PostAsJsonAsync(
            "/api/expenses", input, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(repository.Expenses);
    }

    private static ExpenseInput ValidInput() => new()
    {
        ExpenseNumber = "EXP-TEST-001",
        Description = "停车费",
        Amount = 18m,
        ExpenseDate = new DateOnly(2026, 9, 29),
        Status = "pending"
    };

    private sealed class FakeExpenseRepository : IExpenseRepository
    {
        public List<ExpenseResponse> Expenses { get; } = [];

        public Task<IReadOnlyList<ExpenseResponse>> GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<ExpenseResponse>>(Expenses);

        public Task<ExpenseResponse?> GetAsync(Guid id, CancellationToken cancellationToken) =>
            Task.FromResult(Expenses.SingleOrDefault(expense => expense.Id == id));

        public Task<ExpenseResponse> CreateAsync(ExpenseInput input, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var expense = new ExpenseResponse(Guid.NewGuid(), input.ExpenseNumber, input.Description,
                input.Amount, input.ExpenseDate, input.Status, input.Notes, now, now);
            Expenses.Add(expense);
            return Task.FromResult(expense);
        }

        public Task<ExpenseResponse?> UpdateAsync(Guid id, ExpenseInput input, CancellationToken cancellationToken)
        {
            var index = Expenses.FindIndex(expense => expense.Id == id);
            if (index < 0) return Task.FromResult<ExpenseResponse?>(null);
            var original = Expenses[index];
            var updated = original with
            {
                ExpenseNumber = input.ExpenseNumber,
                Description = input.Description,
                Amount = input.Amount,
                ExpenseDate = input.ExpenseDate,
                Status = input.Status,
                Notes = input.Notes,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            Expenses[index] = updated;
            return Task.FromResult<ExpenseResponse?>(updated);
        }
    }
}

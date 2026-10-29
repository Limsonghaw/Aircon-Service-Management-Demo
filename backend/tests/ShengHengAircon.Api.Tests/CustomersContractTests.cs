using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Customers;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class CustomersContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData("owner")]
    [InlineData("admin")]
    [InlineData("employee")]
    public async Task JobDetails_ReturnOnlyAssignedCustomerContact(string role)
    {
        var now = DateTimeOffset.UtcNow;
        var customer = new CustomerResponse(Guid.NewGuid(), "Customer", CustomerType.Individual,
            "0123456789", "private@example.test", "Service address", "Private notes", now, now);
        var assigned = new CustomerJobResponse(Guid.NewGuid(), "JOB-1", customer.Id, "Service",
            new DateOnly(2026, 10, 2), "A", "scheduled", now, now);
        var unassigned = assigned with { Id = Guid.NewGuid(), JobNumber = "JOB-2" };
        var repository = new FakeCustomerRepository();
        repository.Customers.Add(customer);
        repository.Jobs.AddRange([assigned, unassigned]);
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICustomerRepository>();
            services.AddSingleton<ICustomerRepository>(repository);
            services.RemoveAll<IJobAccessRepository>();
            services.AddSingleton<IJobAccessRepository>(new AssignedJobRepository(assigned));
        }));
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        var ct = TestContext.Current.CancellationToken;
        using var response = await client.GetAsync($"/api/jobs/{assigned.Id}", ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        Assert.Equal(customer.Phone, body.GetProperty("phone").GetString());
        Assert.Equal(customer.Address, body.GetProperty("address").GetString());
        Assert.Equal(customer.Name, body.GetProperty("job").GetProperty("customerName").GetString());
        Assert.False(body.TryGetProperty("email", out _));
        Assert.False(body.TryGetProperty("notes", out _));
        using var other = await client.GetAsync($"/api/jobs/{unassigned.Id}", ct);
        Assert.Equal(role == "employee" ? HttpStatusCode.NotFound : HttpStatusCode.OK, other.StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        using var anonymous = await client.GetAsync($"/api/jobs/{assigned.Id}", ct);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    private sealed class AssignedJobRepository(CustomerJobResponse assigned) : IJobAccessRepository
    {
        public Task<IReadOnlyList<CustomerJobResponse>> GetEmployeeJobsAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<CustomerJobResponse>>([assigned]);
        public Task<IReadOnlyList<EmployeeAccountLink>> GetLinksAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<EmployeeAccountLink>>([]);
        public Task<bool> BindEmployeeAsync(Guid userId, Guid? employeeId, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static readonly JsonSerializerOptions ApiJsonOptions = CreateApiJsonOptions();

    [Fact]
    public async Task CustomerEndpoints_ProvideCrudResponses()
    {
        var repository = new FakeCustomerRepository();
        await using var customerFactory = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<ICustomerRepository>();
                services.AddSingleton<ICustomerRepository>(repository);
            }));
        using var client = customerFactory.CreateClient();
        var cancellationToken = TestContext.Current.CancellationToken;

        var createResponse = await client.PostAsJsonAsync(
            "/api/customers",
            new
            {
                name = "ABC Office",
                customerType = "business",
                phone = "03-1234 5678",
                email = "service@example.com",
                address = (string?)null,
                notes = (string?)null
            },
            cancellationToken);
        var created = await createResponse.Content.ReadFromJsonAsync<CustomerResponse>(
            ApiJsonOptions,
            cancellationToken);

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        Assert.NotNull(created);
        Assert.EndsWith($"/api/customers/{created.Id}", createResponse.Headers.Location?.ToString());

        var list = await client.GetFromJsonAsync<List<CustomerResponse>>(
            "/api/customers",
            ApiJsonOptions,
            cancellationToken);
        Assert.Single(list!);

        var customerJobs = await client.GetFromJsonAsync<List<CustomerJobResponse>>(
            $"/api/customers/{created.Id}/jobs",
            ApiJsonOptions,
            cancellationToken);
        Assert.Empty(customerJobs!);

        var createJobResponse = await client.PostAsJsonAsync(
            $"/api/customers/{created.Id}/jobs",
            new
            {
                jobNumber = "JOB-TEST-001",
                title = "冷气检查",
                serviceDate = "2026-09-29",
                team = "未安排",
                status = "pending"
            },
            cancellationToken);
        var createdJob = await createJobResponse.Content
            .ReadFromJsonAsync<CustomerJobResponse>(ApiJsonOptions, cancellationToken);

        Assert.Equal(HttpStatusCode.Created, createJobResponse.StatusCode);
        Assert.Equal(created.Id, createdJob?.CustomerId);

        var allJobs = await client.GetFromJsonAsync<List<CustomerJobResponse>>(
            "/api/jobs",
            ApiJsonOptions,
            cancellationToken);
        Assert.Equal("ABC Office", Assert.Single(allJobs!).CustomerName);

        var updateJobResponse = await client.PutAsJsonAsync(
            $"/api/jobs/{createdJob!.Id}",
            new
            {
                jobNumber = "JOB-TEST-001",
                title = "冷气检查（已更新）",
                serviceDate = "2026-09-30",
                team = "Team A",
                status = "scheduled"
            },
            cancellationToken);
        var updatedJob = await updateJobResponse.Content
            .ReadFromJsonAsync<CustomerJobResponse>(ApiJsonOptions, cancellationToken);
        Assert.Equal("scheduled", updatedJob?.Status);

        var deleteJobResponse = await client.DeleteAsync(
            $"/api/jobs/{createdJob.Id}",
            cancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, deleteJobResponse.StatusCode);

        var updateResponse = await client.PutAsJsonAsync(
            $"/api/customers/{created.Id}",
            new
            {
                name = "ABC Office Sdn Bhd",
                customerType = "business",
                phone = "03-8765 4321",
                email = (string?)null,
                address = (string?)null,
                notes = (string?)null
            },
            cancellationToken);
        var updated = await updateResponse.Content.ReadFromJsonAsync<CustomerResponse>(
            ApiJsonOptions,
            cancellationToken);

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        Assert.Equal("ABC Office Sdn Bhd", updated?.Name);

        var deleteResponse = await client.DeleteAsync(
            $"/api/customers/{created.Id}",
            cancellationToken);
        var missingResponse = await client.GetAsync(
            $"/api/customers/{created.Id}",
            cancellationToken);

        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missingResponse.StatusCode);
    }

    [Fact]
    public async Task CreateCustomer_ReturnsValidationProblemForInvalidBody()
    {
        var repository = new FakeCustomerRepository();
        await using var customerFactory = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<ICustomerRepository>();
                services.AddSingleton<ICustomerRepository>(repository);
            }));
        using var client = customerFactory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/customers",
            new
            {
                name = string.Empty,
                customerType = "individual",
                phone = string.Empty,
                email = "invalid-email",
                address = (string?)null,
                notes = (string?)null
            },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Empty(repository.Customers);
    }

    [Fact]
    public void CreateCustomerRequest_AcceptsValidValues()
    {
        var request = new CreateCustomerRequest(
            "ABC Office",
            CustomerType.Business,
            "03-1234 5678",
            "service@example.com",
            "Kuala Lumpur",
            null);

        var results = Validate(request);

        Assert.Empty(results);
    }

    [Fact]
    public void CreateCustomerRequest_RejectsInvalidValues()
    {
        var request = new CreateCustomerRequest(
            string.Empty,
            CustomerType.Individual,
            string.Empty,
            "not-an-email",
            new string('a', 1001),
            new string('n', 5001));

        var results = Validate(request);

        Assert.Collection(
            results.OrderBy(result => result.MemberNames.Single()),
            result => Assert.Contains(nameof(CreateCustomerRequest.Address), result.MemberNames),
            result => Assert.Contains(nameof(CreateCustomerRequest.Email), result.MemberNames),
            result => Assert.Contains(nameof(CreateCustomerRequest.Name), result.MemberNames),
            result => Assert.Contains(nameof(CreateCustomerRequest.Notes), result.MemberNames),
            result => Assert.Contains(nameof(CreateCustomerRequest.Phone), result.MemberNames));
    }

    [Fact]
    public void CustomerType_UsesCamelCaseStringJson()
    {
        var jsonOptions = factory.Services
            .GetRequiredService<IOptions<JsonOptions>>()
            .Value
            .JsonSerializerOptions;

        var json = JsonSerializer.Serialize(CustomerType.Business, jsonOptions);

        Assert.Equal("\"business\"", json);
        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<CustomerType>("1", jsonOptions));
    }

    private static IReadOnlyList<ValidationResult> Validate(object value)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(value, new ValidationContext(value), results, true);
        return results;
    }

    private static JsonSerializerOptions CreateApiJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(
            new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
        return options;
    }

    private sealed class FakeCustomerRepository : ICustomerRepository
    {
        public List<CustomerResponse> Customers { get; } = [];
        public List<CustomerJobResponse> Jobs { get; } = [];

        public Task<IReadOnlyList<CustomerResponse>> GetAllAsync(
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CustomerResponse>>(Customers);

        public Task<CustomerResponse?> GetByIdAsync(
            Guid id,
            CancellationToken cancellationToken) =>
            Task.FromResult(Customers.SingleOrDefault(customer => customer.Id == id));

        public Task<IReadOnlyList<CustomerJobResponse>> GetJobsAsync(
            Guid customerId,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CustomerJobResponse>>(
                Jobs.Where(job => job.CustomerId == customerId).ToList());

        public Task<CustomerJobResponse> CreateJobAsync(
            Guid customerId,
            CreateCustomerJobRequest request,
            CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var job = new CustomerJobResponse(
                Guid.NewGuid(),
                request.JobNumber,
                customerId,
                request.Title,
                request.ServiceDate,
                request.Team,
                request.Status,
                now,
                now);
            Jobs.Add(job);
            return Task.FromResult(job);
        }

        public Task<IReadOnlyList<CustomerJobResponse>> GetAllJobsAsync(
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<CustomerJobResponse>>(Jobs);

        public Task<CustomerJobResponse?> UpdateJobAsync(
            Guid id,
            UpdateCustomerJobRequest request,
            CancellationToken cancellationToken)
        {
            var index = Jobs.FindIndex(job => job.Id == id);
            if (index < 0) return Task.FromResult<CustomerJobResponse?>(null);

            var original = Jobs[index];
            var job = original with
            {
                JobNumber = request.JobNumber,
                Title = request.Title,
                ServiceDate = request.ServiceDate,
                Team = request.Team,
                Status = request.Status,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            Jobs[index] = job;
            return Task.FromResult<CustomerJobResponse?>(job);
        }

        public Task<bool> DeleteJobAsync(Guid id, CancellationToken cancellationToken)
        {
            var job = Jobs.SingleOrDefault(item => item.Id == id);
            return Task.FromResult(job is not null && Jobs.Remove(job));
        }

        public Task<CustomerResponse> CreateAsync(
            CreateCustomerRequest request,
            CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var customer = new CustomerResponse(
                Guid.NewGuid(),
                request.Name,
                request.CustomerType,
                request.Phone,
                request.Email,
                request.Address,
                request.Notes,
                now,
                now);
            Customers.Add(customer);
            return Task.FromResult(customer);
        }

        public Task<CustomerResponse?> UpdateAsync(
            Guid id,
            UpdateCustomerRequest request,
            CancellationToken cancellationToken)
        {
            var index = Customers.FindIndex(customer => customer.Id == id);
            if (index < 0)
            {
                return Task.FromResult<CustomerResponse?>(null);
            }

            var original = Customers[index];
            var customer = original with
            {
                Name = request.Name,
                CustomerType = request.CustomerType,
                Phone = request.Phone,
                Email = request.Email,
                Address = request.Address,
                Notes = request.Notes,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            Customers[index] = customer;
            return Task.FromResult<CustomerResponse?>(customer);
        }

        public Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
        {
            var customer = Customers.SingleOrDefault(customer => customer.Id == id);
            return Task.FromResult(customer is not null && Customers.Remove(customer));
        }
    }
}

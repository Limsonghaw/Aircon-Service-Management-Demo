namespace ShengHengAircon.Api.Features.Customers;

public interface ICustomerRepository
{
    Task<IReadOnlyList<CustomerResponse>> GetAllAsync(CancellationToken cancellationToken);

    Task<CustomerResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken);

    Task<IReadOnlyList<CustomerJobResponse>> GetJobsAsync(
        Guid customerId,
        CancellationToken cancellationToken);

    Task<CustomerJobResponse> CreateJobAsync(
        Guid customerId,
        CreateCustomerJobRequest request,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<CustomerJobResponse>> GetAllJobsAsync(
        CancellationToken cancellationToken);

    Task<CustomerJobResponse?> UpdateJobAsync(
        Guid id,
        UpdateCustomerJobRequest request,
        CancellationToken cancellationToken);

    Task<bool> DeleteJobAsync(Guid id, CancellationToken cancellationToken);

    Task<CustomerResponse> CreateAsync(
        CreateCustomerRequest request,
        CancellationToken cancellationToken);

    Task<CustomerResponse?> UpdateAsync(
        Guid id,
        UpdateCustomerRequest request,
        CancellationToken cancellationToken);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken);
}

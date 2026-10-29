namespace ShengHengAircon.Api.Features.Customers;

public sealed record CustomerResponse(
    Guid Id,
    string Name,
    CustomerType CustomerType,
    string Phone,
    string? Email,
    string? Address,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

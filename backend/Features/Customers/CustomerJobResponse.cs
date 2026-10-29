namespace ShengHengAircon.Api.Features.Customers;

public sealed record CustomerJobResponse(
    Guid Id,
    string JobNumber,
    Guid CustomerId,
    string Title,
    DateOnly ServiceDate,
    string Team,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? CustomerName = null);

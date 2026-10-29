namespace ShengHengAircon.Api.Features.Invoices;

public sealed record InvoiceResponse(
    Guid Id,
    string InvoiceNumber,
    Guid CustomerId,
    string CustomerName,
    decimal Amount,
    DateOnly DueDate,
    InvoiceStatus Status,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<InvoiceItem>? Items = null,
    decimal Discount = 0);

namespace ShengHengAircon.Api.Features.Invoices;

public interface IInvoiceRepository
{
    Task<IReadOnlyList<InvoiceResponse>> GetAllAsync(CancellationToken cancellationToken);
    Task<InvoiceResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<InvoiceResponse> CreateAsync(CreateInvoiceRequest request, CancellationToken cancellationToken);
    Task<InvoiceResponse?> UpdateAsync(Guid id, UpdateInvoiceRequest request, CancellationToken cancellationToken);
}

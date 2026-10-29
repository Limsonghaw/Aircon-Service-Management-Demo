using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Invoices;

public sealed class UpdateInvoiceRequest(
    string invoiceNumber,
    Guid customerId,
    decimal amount,
    DateOnly dueDate,
    InvoiceStatus status,
    string? notes) : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 1)]
    public string InvoiceNumber { get; } = invoiceNumber;

    public Guid CustomerId { get; } = customerId;

    [Range(typeof(decimal), "0.01", "9999999999.99")]
    public decimal Amount { get; } = amount;

    public DateOnly DueDate { get; } = dueDate;

    public InvoiceStatus Status { get; } = status;

    [StringLength(5000)]
    public string? Notes { get; } = notes;
    [MaxLength(100)] public List<InvoiceItem> Items { get; set; } = [];
    [Range(typeof(decimal), "0", "9999999999.99")] public decimal Discount { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context) =>
        InvoiceDocumentValidation.Validate(Items, Discount);
}

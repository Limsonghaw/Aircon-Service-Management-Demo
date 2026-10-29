using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Invoices;

public sealed class InvoiceItem
{
    [Required, StringLength(1000)] public string Description { get; set; } = "";
    [Range(typeof(decimal), "0.01", "1000000")] public decimal Quantity { get; set; }
    [Range(typeof(decimal), "0", "9999999999.99")] public decimal UnitPrice { get; set; }
}

using System.ComponentModel.DataAnnotations;

namespace ShengHengAircon.Api.Features.Customers;

public sealed class UpdateCustomerRequest(
    string name,
    CustomerType customerType,
    string phone,
    string? email,
    string? address,
    string? notes)
{
    [Required, StringLength(200, MinimumLength = 1)]
    public string Name { get; } = name;

    public CustomerType CustomerType { get; } = customerType;

    [Required, StringLength(50, MinimumLength = 1)]
    public string Phone { get; } = phone;

    [EmailAddress, StringLength(320)]
    public string? Email { get; } = email;

    [StringLength(1000)]
    public string? Address { get; } = address;

    [StringLength(5000)]
    public string? Notes { get; } = notes;
}

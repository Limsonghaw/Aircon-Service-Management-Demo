using ShengHengAircon.Api.Options;
using ShengHengAircon.Api.Features.Customers;
using ShengHengAircon.Api.Features.Invoices;
using ShengHengAircon.Api.Features.Quotes;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Features.Teams;
using ShengHengAircon.Api.Features.ActivityLogs;
using ShengHengAircon.Api.Features.Auth;
using ShengHengAircon.Api.Features.Documents;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

var keyPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(keyPath))
{
    var protection = builder.Services.AddDataProtection()
        .SetApplicationName("ShengHengAircon")
        .PersistKeysToFileSystem(new DirectoryInfo(keyPath));
    if (OperatingSystem.IsWindows())
        protection.ProtectKeysWithDpapi();
}

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(
            new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
    });
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();
builder.Services.AddTransient<ActivityActorHandler>();
builder.Services.AddHttpClient<ICustomerRepository, SupabaseCustomerRepository>().AddHttpMessageHandler<ActivityActorHandler>();
builder.Services.AddHttpClient<IInvoiceRepository, SupabaseInvoiceRepository>().AddHttpMessageHandler<ActivityActorHandler>();
builder.Services.AddHttpClient<IQuoteRepository, SupabaseQuoteRepository>().AddHttpMessageHandler<ActivityActorHandler>();
builder.Services.AddHttpClient<IExpenseRepository, SupabaseExpenseRepository>().AddHttpMessageHandler<ActivityActorHandler>();
builder.Services.AddHttpClient<IExpenseReceiptStore, SupabaseExpenseReceiptStore>();
builder.Services.AddHttpClient<IJobPhotoStore, SupabaseJobPhotoStore>();
builder.Services.AddHttpClient<IJobPoDocumentStore, SupabaseJobPoDocumentStore>();
  builder.Services.AddHttpClient<ICustomerReturnedDocumentStore, SupabaseCustomerReturnedDocumentStore>();
  builder.Services.AddHttpClient<IReferenceDocumentStore, SupabaseReferenceDocumentStore>();
builder.Services.AddHttpClient<ITeamRepository, SupabaseTeamRepository>().AddHttpMessageHandler<ActivityActorHandler>();
builder.Services.AddHttpClient<IActivityLogRepository, SupabaseActivityLogRepository>();
builder.Services.AddHttpClient<IJobAccessRepository, SupabaseJobAccessRepository>();
builder.Services.AddHttpClient<IUserAccessRepository, SupabaseUserAccessRepository>();
builder.Services.AddHttpClient<IDocumentStore, SupabaseDocumentStore>();
builder.Services.AddHttpClient<IArchivedDocumentStore, SupabaseArchivedDocumentStore>();
builder.Services.AddHttpClient<ISavedSignatureStore, SupabaseDocumentStore>();
builder.Services.AddSingleton<IDocumentPdfRenderer, PlaywrightDocumentPdfRenderer>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "shengheng.session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(AuthorizationPolicies.Owner, policy => policy.RequireRole(UserRoles.Owner))
    .AddPolicy(AuthorizationPolicies.Management,
        policy => policy.RequireRole(UserRoles.Owner, UserRoles.Admin));
builder.Services
    .AddOptions<SupabaseOptions>()
    .Bind(builder.Configuration.GetSection(SupabaseOptions.SectionName))
    .Validate(
        options => !options.Enabled || IsValidSupabaseUrl(options.Url),
        "Supabase:Url must be an absolute HTTP or HTTPS URL when Supabase is enabled.")
    .Validate(
        options => !options.Enabled || !string.IsNullOrWhiteSpace(options.ServiceRoleKey),
        "Supabase:ServiceRoleKey is required when Supabase is enabled.")
    .ValidateOnStart();
builder.Services
.AddOptions<CompanyProfileOptions>()
    .Bind(builder.Configuration.GetSection(CompanyProfileOptions.SectionName))
    .Validate(
        options => !string.IsNullOrWhiteSpace(options.EnglishName),
        "CompanyProfile:EnglishName is required.")
    .ValidateOnStart();
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
    };
});
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        var allowedOrigins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? [];

        if (allowedOrigins.Length > 0)
        {
            policy
                .WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapControllers();
// Unknown API routes must remain 404, never return the React HTML shell.
app.Map("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();

static bool IsValidSupabaseUrl(string? value)
{
    return Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}

public partial class Program;

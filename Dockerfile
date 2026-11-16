FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY backend/ShengHengAircon.Api.csproj backend/
RUN dotnet restore backend/ShengHengAircon.Api.csproj
COPY backend/ backend/
COPY frontend/src/components/DocumentPreview.css frontend/src/components/DocumentPreview.css
RUN dotnet publish backend/ShengHengAircon.Api.csproj -c Release --no-restore -o /publish /p:UseAppHost=false

# The SDK image supplies PowerShell for the Playwright installer.
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://0.0.0.0:10000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /publish/ ./
RUN pwsh ./playwright.ps1 install --with-deps chromium
EXPOSE 10000
ENTRYPOINT ["dotnet", "ShengHengAircon.Api.dll"]

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["backend-csharp/backend-csharp.csproj", "backend-csharp/"]
RUN dotnet restore "backend-csharp/backend-csharp.csproj"
COPY backend-csharp/ backend-csharp/
WORKDIR /src/backend-csharp
RUN dotnet publish "backend-csharp.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
EXPOSE 4000
ENV ASPNETCORE_URLS=http://+:4000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=15s \
  CMD curl -fsS http://localhost:4000/ready || exit 1
ENTRYPOINT ["dotnet", "Kzys.Backend.dll"]

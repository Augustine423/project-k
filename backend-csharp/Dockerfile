FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["backend-csharp/backend-csharp.csproj", "backend-csharp/"]
RUN dotnet restore "backend-csharp/backend-csharp.csproj"
COPY backend-csharp/ backend-csharp/
WORKDIR /src/backend-csharp
RUN dotnet publish "backend-csharp.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "Kzys.Backend.dll"]

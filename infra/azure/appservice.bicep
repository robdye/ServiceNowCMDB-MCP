@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Web App name (must be globally unique)')
param appName string

@description('App Service plan SKU')
param skuName string = 'B1'

@description('ServiceNow instance URL')
param serviceNowInstance string = ''

@description('ServiceNow OAuth2 Client ID')
@secure()
param serviceNowClientId string = ''

@description('ServiceNow OAuth2 Client Secret')
@secure()
param serviceNowClientSecret string = ''

@description('ServiceNow username (optional, for resource owner grant)')
@secure()
param serviceNowUsername string = ''

@description('ServiceNow password (optional, for resource owner grant)')
@secure()
param serviceNowPassword string = ''

var planName = '${appName}-plan'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: skuName
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.13'
      alwaysOn: true
      webSocketsEnabled: true
      appCommandLine: 'bash /home/site/wwwroot/startup.sh'
      appSettings: concat(
        [
          {
            name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
            value: 'true'
          }
        ],
        serviceNowInstance != ''
          ? [
              {
                name: 'SERVICENOW_INSTANCE'
                value: serviceNowInstance
              }
            ]
          : [],
        serviceNowClientId != ''
          ? [
              {
                name: 'SERVICENOW_CLIENT_ID'
                value: serviceNowClientId
              }
            ]
          : [],
        serviceNowClientSecret != ''
          ? [
              {
                name: 'SERVICENOW_CLIENT_SECRET'
                value: serviceNowClientSecret
              }
            ]
          : [],
        serviceNowUsername != ''
          ? [
              {
                name: 'SERVICENOW_USERNAME'
                value: serviceNowUsername
              }
            ]
          : [],
        serviceNowPassword != ''
          ? [
              {
                name: 'SERVICENOW_PASSWORD'
                value: serviceNowPassword
              }
            ]
          : []
      )
    }
  }
}

output appUrl string = 'https://${webApp.properties.defaultHostName}'
output mcpEndpoint string = 'https://${webApp.properties.defaultHostName}/mcp'
output sseEndpoint string = 'https://${webApp.properties.defaultHostName}/sse'

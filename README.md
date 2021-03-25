# Azure keyvault secret-expiry checker

#### Azure setup
Create a Service Principal:  
`az ad sp create-for-rbac -n <your-application-name> --skip-assignment`

Which outputs something like:  
```
{  
  "appId": "generated-app-ID",
  "displayName": "dummy-app-name",
  "name": "http://dummy-app-name",
  "password": "random-password",
  "tenant": "tenant-ID"
}
```

Use the returned values as your AZURE_ secrets:
```
AZURE_CLIENT_ID="generated-app-ID"
AZURE_CLIENT_SECRET="random-password"
AZURE_TENANT_ID="tenant-ID"
```

Finally, set permissions for your SP:  
`az keyvault set-policy --name <your-key-vault-name> --spn $AZURE_CLIENT_ID --secret-permissions list`

Or you can use RBAC, in which case the SP will need the "Key Vault Reader" role:  
```
az role assignment create
        --role 21090545-7ca7-4776-b22c-e363652d74d2
        --assignee-object-id <object_id>
        --assignee-principal-type ServicePrincipal
        --scope <scope>
        --subscription <SUBSCRIPTION_ID>
```
(object_id can be retrieved from the Azure portal)

#### Inputs
This action takes 3 inputs:
* vault -> name of the keyvault (required)
* notify-via -> slack or email. If left blank, output is printed to the console.
* to -> recipients (slack channel / user or email recipient.) (required if notify-via is set)
* ignore-tags -> A list of tags that should be ignored if present
* only-defined -> Only secrets that has an expiration date specified will be checked.


#### Ensure you have the required authentication set up in your environment:
```yaml
env:
  AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
  AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
  AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
  MAILSERVER_PASSWORD: ${{ secrets.MAILSERVER_PASSWORD }} # Only required if sending email
  MAILSERVER_USER: ${{ secrets.MAILSERVER_USER }} # Only required if sending email
  SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # Only required if notifying via slack
```


#### Examples:
```yaml
name: Check AZ Keyvault
on:
  schedule:
    - cron: '0 3 * * *' # nightly tests run at 3 AM UTC
jobs:
  check:
    runs-on: ubuntu-latest
    name: Check AZ keyvault
    steps:
      - uses: equinor/oilmod-kv-checker
        with:
          notify-via: email
          to: 'mail@mail.com; mail2@mail.com'
          vault: my-secret-kv-name
          ignore-tags: 'ignore_me' # will ignore secrets with the 'ignore_me' tag
          env:
            AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
            AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
            AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
            MAILSERVER_PASSWORD: ${{ secrets.MAILSERVER_PASSWORD }} # Only required if sending email
            MAILSERVER_USER: ${{ secrets.MAILSERVER_USER }} # Only required if sending email
```


```yaml
name: Check multiple vaults with matrix
on:
  schedule:
    - cron: '0 3 * * *' # nightly tests run at 3 AM UTC
jobs:
  check:
    runs-on: ubuntu-latest
    name: Check AZ keyvault
    strategy:
      matrix:
        keyvault: ['vault-1', 'vault-2', 'vault-3']
    steps:
      - uses: equinor/oilmod-kv-checker
        with:
          notify-via: slack
          to: '#my-alert-channel'
          vault: ${{ matrix.keyvault }}
          only-defined: 1 # Only check defined secrets
          env:
            AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
            AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
            AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
            SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }} # Only required if notifying via slack
```

#### CLI:

Send alert via mail:
```shell script
$ node index.js -v keyvault-name --notifyBy email --to mail@mail.com [--to mail2@mail.com]
```

Send alert via Slack:
```shell script
  $ node index.js -v keyvault-name --notifyBy slack --to channel
```
If notifyBy is omitted, warnings are printed to the console:

```shell script
  $ node index.js -v keyvault-name
```


#### Building:
Builds are performed with [@vercel/ncc](https://www.npmjs.com/package/@vercel/ncc):  
`ncc build index.js --license licenses.txt`

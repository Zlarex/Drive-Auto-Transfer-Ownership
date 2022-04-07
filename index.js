require('dotenv').config()
const cron = require('node-cron')
const {google} = require('googleapis')

const client_id = process.env.CLIENT_ID
const client_secret = process.env.CLIENT_SECRET
const redirect_uri = process.env.REDIR_URI
const refresh_token = process.env.REFRESH_TOKEN
const ownerMail = process.env.OWNER_MAIL
const targetMail = process.env.TARGET_MAIL
const folderId = process.env.SOURCE_FOLDER_ID

const file_lastModified = process.env.FILTER_LASTMODIFIED_DAYS
const file_size = process.env.FILTER_SIZE_MB
const transferTime = process.env.TRANSFER_TIME

let drive

cron.schedule(transferTime, () =>
    {
        const client = new google.auth.OAuth2({
            clientId: client_id,
            clientSecret: client_secret,
            redirectUri:  redirect_uri
        })
        
        client.setCredentials({refresh_token: refresh_token, scope: ['https://www.googleapis.com/auth/drive']})
        
        drive = google.drive({
            version: 'v3',
            auth: client
        })

        locateAndUpdate(folderId)
    },
    {
        timezone: 'Asia/Jakarta'
    }
)

function locateAndUpdate(id)
{
    drive.files.list({
        spaces: 'drive',
        fields: 'nextPageToken, files(id, name, size, mimeType, ownedByMe, parents, modifiedTime, permissions, permissionIds, owners)',
    }, (err, res) => {
        if (err) return console.log(`API error: ${err}`)
        let files  = res.data.files
        if (files.length > 0)
        {
            files.forEach(f => {
                if (f.parents == id)
                {
                    if (f.mimeType == 'application/vnd.google-apps.folder')
                    {
                        console.log(`FOLDER: ${f.name}`)
                        locateAndUpdate(f.id)
                    }
                    else
                    {
                        console.log(`>> File Found: ${f.name} ID: ${f.id} - size: ${f.size} ${f.mimeType} - ${f.modifiedTime}`)
                        const modTime = new Date(f.modifiedTime)
                        let curTime = new Date()

                        const negTime = curTime.getTime() - modTime.getTime()
                        let filterTime = negTime > ((24 * 60 * 60 * 1000) * file_lastModified)
                        let filterSize = f.size / (1_000_000 * file_size) <= 1
                        if (f.owners[0].emailAddress == ownerMail && filterTime && filterSize)
                        {
                            const permId = f.permissions.find(f => f.emailAddress == targetMail).id
                            drive.permissions.update({
                                fileId: f.id,
                                permissionId: permId,
                                transferOwnership: true,
                                requestBody: {
                                    role: 'owner',
                                    pendingOwner: true
                                }
                            })
                            console.log(`>> Info: Ownership for [${f.name}] has been transfered`)
                        }
                    }
                }
            })
        }
    })
}
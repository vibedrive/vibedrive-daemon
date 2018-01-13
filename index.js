if (!['production'].includes(process.env.NODE_ENV)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

global.window = {
  localStorage: {
    getItem: () => {},
    setItem: () => {}
  }
}

var pkg = require('./package.json')
var os = require('os')
var assert = require('assert')
var fs = require('fs')
var path = require('path')
var yaml = require('js-yaml')
var mv = require('mv')
var mkdirp = require('mkdirp')
var vibedrive = require('vibedrive-sdk')
var Folder = require('managed-folder')
var AudioFile = require('./AudioFile')
var logger = require('../lib/logger')
var folderStructureFromHash = require('./folder-structure')

const config = yaml.safeLoad(fs.readFileSync(path.join(__dirname, 'config.yaml')))

if (require.main === module) {
  logger.debug(pkg.name, ': called directly')
  main()
} else {
  logger.debug(pkg.name, ': required as a module')
  module.exports = {
    login,
    fetchUserIdentity,
    inboxAdd,
    mvRecursive
  }
}

async function main () {
  var opts = {
    appdir: path.join(os.homedir(), 'Vibedrive'),
    subfolders: {
      inbox: 'Inbox',
      library: 'Library',
      unsupported: 'Unsupported'
    }
  }

  var folder = Folder(opts)

  folder.on('ready', function () {
    login().then(fetchUserIdentity)
  })
}

function login () {
  logger.info('ready')

  var folder = this

  folder.on('inbox:add', inboxAdd)

  var login = vibedrive.auth.login(config.user.username, config.user.password)

  return Promise.of(login)
}

async function fetchUserIdentity (loggedIn) {
  assert.equal(loggedIn, true, 'expect true if login succeeded')

  try {
    var { id, email, username } = await vibedrive.user.get()
    logger.debug('logged in with', id, email, username)
  } catch (err) {
    // panic
    logger.error(err)
    process.exit(0)
  }
}

function inboxAdd (filepath) {
  logger.debug('file added to inbox folder:', filepath)

  var folder = this
  var fileExtension = path.extname(filepath)
  var stats = fs.statSync(filepath)
  var file = {
    filepath,
    fileExtension,
    stats,
    _folder: folder
  }

  // mp3 only
  if (!['.mp3'].includes(fileExtension)) {
    moveToUnsupportedFolder.call(file)
    return logger.warning(`couldn't read ${fileExtension} file. moved to the 'unsupported' folder.`)
  }

  var audioFile = AudioFile({
    name: path.basename(file.filepath),
    path: file.filepath,
    type: 'audio/mp3',
    size: file.stats.size
  })

  audioFile.on('error', onLoadError)
  audioFile.on('load', onLoad)

  audioFile.load()

  function moveToUnsupportedFolder () {
    var file = this

    var unsupportedSubfolder = file._folder.subfolders.unsupported
    var source = file.filepath
    var destination = path.join(unsupportedSubfolder, path.basename(file.filepath))

    mvRecursive(source, destination)
  }

  async function onLoad () {
    try {
      await vibedrive.track.create(audioFile)
      logger.debug('track created')
      var filename = path.basename(filepath)

      await vibedrive.upload.upload(audioFile)
      logger.debug('file uploaded')

      var folderStructure = folderStructureFromHash(audioFile.hash)
      var destination = path.join(filepath, '../../', 'Library', folderStructure)

      mkdirp(destination, function (err) {
        if (err) { return console.log(err) }
        mv(filepath, path.join(destination, filename), function (err) {
          if (err) { return console.log(err) }
          // done
          logger.debug('moved the file.')
        })
      })
    } catch (err) {
      logger.error('oops', err)
    }
  }

  function createTrack () {

  }

  function uploadFile () {

  }

  function onLoadError (err) {
    logger.error(err)
  }
}

function mvRecursive (source, destination) {
  mv(source, destination, function (err) {
    if (err) mvRecursive(source, destination)
  })
}

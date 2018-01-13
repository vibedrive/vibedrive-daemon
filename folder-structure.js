var path = require('path')
var assert = require('assert')

module.exports = AbsolutePath

function AbsolutePath () {
  return {
    from: function (hash = '') {
      assert.ok(typeof hash, 'string')

      var hashArr = hash.split('')
      var dir = '/'

      // dir = 3x2 bytes joined by '/' and followed by the rest of the bytes

      for (let i = 0; i < 4; i++) {
        var part = hashArr.shift() + hashArr.shift()
        dir = path.join(dir, part)
      }

      return path.join(dir, hashArr.join(''))
    }
  }
}

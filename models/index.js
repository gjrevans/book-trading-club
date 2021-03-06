var Models = function(){
    var self = this;
    require('fs').readdirSync(__dirname + '/').forEach(function(file) {
        if (file !== 'index.js') {
            var name = file.replace('.js', '');
            self[name] = require('./' + file);
            self[name] = new self[name];
        }
    });
};

module.exports = Models;

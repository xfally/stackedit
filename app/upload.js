var path = require('path');
var multiparty = require('multiparty');

exports.uploadImg = function(req, res) {
    // Make sure uploadDir is exist! As we won't process "dir/file not found" error currently.
    var options = {
        uploadDir: __dirname + "/../public/upload/images/"
    };
    var form = new multiparty.Form(options);
    form.on('error', function(err) {
        console.log('Error parsing form: ' + err.stack);
        return;
    });
    // 'file' is easier than 'part'
    form.on('file', function(name, file) {
        if (file.originalFilename && file.path) {
            console.log('StackEdit: upload: image file, oldName: ' + file.originalFilename + ', newName: ' + path.basename(file.path));
            res.setHeader('Content-Type', 'text/json');
            res.end('{"image_path":"upload/images/' + path.basename(file.path) + '"}');
            return;
        }
    });
    form.on('close', function() {
        //console.log('StackEdit: upload: Completed!');
        return;
    });
    form.parse(req);
};

define([
    "jquery",
    "jquery-form",
    "underscore",
    "constants",
    "utils",
    "classes/Extension",
    "toMarkdown",
], function($, jqueryForm, _, constants, utils, Extension, toMarkdown) {
// juqeryForm is just a placeholder, not used at all.

    var dialogOpenHarddrive = new Extension("dialogOpenHarddrive", 'Dialog "Open from"');

    var fileMgr;
    dialogOpenHarddrive.onFileMgrCreated = function(fileMgrParameter) {
        fileMgr = fileMgrParameter;
    };

    var eventMgr;
    dialogOpenHarddrive.onEventMgrCreated = function(eventMgrParameter) {
        eventMgr = eventMgrParameter;
    };

    var contentWrapper;
    var converter;
    var htmlContentWrapper = function(content) {
        return converter.makeMd(content);
    };
    function handleFileImport(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        var files = (evt.dataTransfer || evt.target).files;
        $(".modal-import-harddrive-markdown, .modal-import-harddrive-html").modal("hide");
        _.each(files, function(file) {
            if($(evt.target).is("#wmd-input *") && file.name.match(/.(jpe?g|png|gif)$/i)) {
                return;
            }
            if(file.name.match(/.(jpe?g|png|gif)$/i)) {
                var options = {
                    url: constants.IMAGE_UPLOAD_URL,
                    type: "POST",
                    dataType: "text/json",
                    timeout: constants.AJAX_TIMEOUT,
                    clearForm: true,
                    resetForm: true,
                    complete: function(res) {
                        if (res.responseText) {
                            var imageInfo = $.parseJSON(res.responseText);
                            if (imageInfo) {
                                $("#input-insert-image").val(constants.BASE_URL + imageInfo.image_path);
                                var a;
                                a = $("#input-file-upload-harddrive-image");
                                eventMgr.onMessage(file.name + " upload succeeded.");
                                return;
                            }
                        }
                        eventMgr.onError(file.name + " upload failed!");
                        return;
                    }
                };
                $('#form-upload-harddrive-image').ajaxSubmit(options);
                return;
            }
            var reader = new FileReader();
            reader.onload = (function(importedFile) {
                return function(e) {
                    var content = e.target.result;
                    if(content.match(/\uFFFD/)) {
                        eventMgr.onError(importedFile.name + " is a binary file.");
                        return;
                    }
                    content = contentWrapper ? contentWrapper(content) : content;
                    if(content === undefined) {
                        eventMgr.onError(importedFile.name + " is not a valid HTML file.");
                        return;
                    }
                    var title = importedFile.name;
                    var dotPosition = title.lastIndexOf(".");
                    title = dotPosition !== -1 ? title.substring(0, dotPosition) : title; 
                    var fileDesc = fileMgr.createFile(title, content);
                    fileMgr.selectFile(fileDesc);
                };
            })(file);
            var blob = file.slice(0, constants.IMPORT_FILE_MAX_CONTENT_SIZE);
            reader.readAsText(blob);
        });
    }

    function handleMarkdownImport(evt) {
        contentWrapper = undefined;
        handleFileImport(evt);
    }
    
    function handleHtmlImport(evt) {
        contentWrapper = htmlContentWrapper;
        handleFileImport(evt);
    }
    
    function handleImageUpload(evt) {
        contentWrapper = undefined;
        handleFileImport(evt);
    }

    function handleDragOver(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';
    }

    dialogOpenHarddrive.onReady = function() {
        // Create toMarkdown converter
        converter = new toMarkdown.converter();
        
        $("#input-file-import-harddrive-markdown").change(handleMarkdownImport);
        $('#dropzone-import-harddrive-markdown, #wmd-input').each(function() {
            this.addEventListener('dragover', handleDragOver, false);
            this.addEventListener('drop', handleMarkdownImport, false);
        });
        $("#input-file-import-harddrive-html").change(handleHtmlImport);
        $('#dropzone-import-harddrive-html').each(function() {
            this.addEventListener('dragover', handleDragOver, false);
            this.addEventListener('drop', handleHtmlImport, false);
        });
        $("#input-file-upload-harddrive-image").change(handleImageUpload);
        $(".action-convert-html").click(function(e) {
            var content = utils.getInputTextValue("#input-convert-html", e);
            if(content === undefined) {
                return;
            }
            content = converter.makeMd(content);
            if(content === undefined) {
                eventMgr.onError("Invalid HTML code.");
                return;
            }
            var fileDesc = fileMgr.createFile(undefined, content);
            fileMgr.selectFile(fileDesc);
        });
    };

    return dialogOpenHarddrive;

});

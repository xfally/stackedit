define([
	"jquery",
	"underscore",
	"constants",
	"utils",
	"storage",
	"settings",
	"eventMgr",
	"fileSystem",
	"fileMgr",
	"monetizejs",
	"classes/Provider",
	"classes/AsyncTask",
	"providers/bloggerProvider",
	"providers/bloggerPageProvider",
	"providers/dropboxProvider",
	"providers/gistProvider",
	"providers/githubProvider",
	"providers/gdriveProvider",
	"providers/gdrivesecProvider",
	"providers/gdriveterProvider",
	"providers/sshProvider",
	"providers/tumblrProvider",
	"providers/wordpressProvider"
], function($, _, constants, utils, storage, settings, eventMgr, fileSystem, fileMgr, MonetizeJS, Provider, AsyncTask) {

	var publisher = {};

	// Create a map with providerId: providerModule
	var providerMap = _.chain(arguments).map(function(argument) {
		return argument instanceof Provider && argument.isPublishEnabled === true && [
			argument.providerId,
			argument
		];
	}).compact().object().value();

	// Retrieve publish locations from storage
	(function() {
		var publishIndexMap = {};
		_.each(fileSystem, function(fileDesc) {
			utils.retrieveIndexArray(fileDesc.fileIndex + ".publish").forEach(function(publishIndex) {
				try {
					var publishAttributes = JSON.parse(storage[publishIndex]);
					// Store publishIndex
					publishAttributes.publishIndex = publishIndex;
					// Replace provider ID by provider module in attributes
					var provider = providerMap[publishAttributes.provider];
					if(!provider) {
						throw new Error("Invalid provider ID: " + publishAttributes.provider);
					}
					publishAttributes.provider = provider;
					fileDesc.publishLocations[publishIndex] = publishAttributes;
					publishIndexMap[publishIndex] = publishAttributes;
				}
				catch(e) {
					// storage can be corrupted
					eventMgr.onError(e);
					// Remove publish location
					utils.removeIndexFromArray(fileDesc.fileIndex + ".publish", publishIndex);
				}
			});
		});

		// Clean fields from deleted files in local storage
		Object.keys(storage).forEach(function(key) {
			var match = key.match(/publish\.\S+/);
			if(match && !publishIndexMap.hasOwnProperty(match[0])) {
				storage.removeItem(key);
			}
		});
	})();

	// Apply template to the current document
	publisher.applyTemplate = function(fileDesc, publishAttributes, html) {
		try {
			var template = (publishAttributes && publishAttributes.customTmpl) || settings.template;
			return _.template(template, {
				documentTitle: fileDesc.title,
				documentMarkdown: fileDesc.content,
				strippedDocumentMarkdown: fileDesc.content.substring(fileDesc.frontMatter ? fileDesc.frontMatter._frontMatter.length : 0),
				documentHTML: html.withoutComments,
				documentHTMLWithFrontMatter: (fileDesc.frontMatter ? fileDesc.frontMatter._frontMatter : '') + html.withoutComments,
				documentHTMLWithComments: html.withComments,
				frontMatter: fileDesc.frontMatter,
				publishAttributes: publishAttributes
			});
		}
		catch(e) {
			eventMgr.onError(e);
			return e.message;
		}
	};

	// Change outer css to inner one
	publisher.cssOuter2Inner = function(outer) {
		return outer.replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/&lt;link(\s+(type=\"text\/css\"|rel=\"stylesheet\"))+\s+href=\"(\S+)\"(\s+.*|\s*)\/?&gt;/gi, function (s, t1, t2, t3) {
			t3 = t3.replace(/https?:\/\/(stackedit\.io|localhost|127\.0\.0\.1)(:\d+)?\//gi, "");
			if(!t3) {return "";}
			var inner = "//css not found!";
			$.ajax({
				type    : 'GET',
				url     : t3,
				async   : false,
				dataType: 'text',
				cache   : false,
				success : function(r) {
					inner = [
						'<style type="text/css">',
						r,
						'</style>'
					].join('\n');
				}
			});
			return inner;
		}).replace(/&lt;/g, "<").replace(/&gt;/g, ">");
	};

	// Change outer javascript to inner one
	publisher.jsOuter2Inner = function(outer) {
		return outer.replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/&lt;script(\s+(type=\"text\/javascript\"))?.*\s+src=\"(\S+)\"(\s+.*|\s*)\/?&gt;\s*&lt;\/script&gt;/gi, function(s, t1, t2, t3) {
			t3 = t3.replace(/https?:\/\/(stackedit\.io|localhost|127\.0\.0\.1)(:\d+)?\//gi, "").replace(/.*mathjax.*/gi, "");
			if(!t3) {return "";}
			var inner = "//js not found!";
			$.ajax({
				type    : 'GET',
				url     : t3,
				async   : false,
				dataType: 'text',
				cache   : false,
				success : function(r) {
					inner = [
						'<script type="text/javascript">',
						r,
						'</script>'
					].join('\n');
				}
			});
			return inner;
		}).replace(/&lt;/g, "<").replace(/&gt;/g, ">");
	};

	// Change outer image to inner one
	publisher.imageOuter2Inner = function(outer) {
		return outer.replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/&lt;img\s+(.*)src=\"(\S+)\"(\s+.*|\s*)\/?&gt;/gi, function (s, t1, t2, t3) {
			t2 = t2.replace(/https?:\/\/(stackedit\.io|localhost|127\.0\.0\.1)(:\d+)?\//gi, "").replace(/https?:\/\/(\S+\.)*monetizejs\.com\//gi, "");
			if(!t1) {t1 = "";}
			if(!t2) {return "";}
			if(!t3) {t3 = "";}
			var inner = "//image not found!";
			// WARNING: Don't support cross origin image, now
			var img = $('img[src="'+t2+'"]')[0];
			if(img) {
				var canvas = document.createElement('CANVAS');
				var ctx = canvas.getContext('2d');
				var dataURL;
				canvas.height = img.height;
				canvas.width = img.width;
				ctx.drawImage(img, 0, 0);
				dataURL = canvas.toDataURL();
				canvas = null; 
				inner = [
					'<img ' + t1,
					'src="' + dataURL + '"',
					t3 + '>'
				].join(' ');
			}
			return inner;
		}).replace(/&lt;/g, "<").replace(/&gt;/g, ">");
	};

	// Used to get content to publish
	function getPublishContent(fileDesc, publishAttributes, html) {
		if(publishAttributes.format === undefined) {
			publishAttributes.format = utils.getInputRadio("radio-publish-format");
			if(publishAttributes.format == 'template' && utils.getInputChecked("#checkbox-publish-custom-template")) {
				publishAttributes.customTmpl = utils.getInputValue('#textarea-publish-custom-template');
			}
		}
		if(publishAttributes.format == "markdown") {
			return fileDesc.content;
		}
		else if(publishAttributes.format == "html") {
			return html.withoutComments;
		}
		else {
			return publisher.applyTemplate(fileDesc, publishAttributes, html);
		}
	}

	// Recursive function to publish a file on multiple locations
	var publishAttributesList = [];
	var publishFileDesc;
	var publishHTML;

	function publishLocation(callback, errorFlag) {

		// No more publish location for this document
		if(publishAttributesList.length === 0) {
			callback(errorFlag);
			return;
		}

		// Dequeue a synchronized location
		var publishAttributes = publishAttributesList.pop();

		// Format the content
		var content = getPublishContent(publishFileDesc, publishAttributes, publishHTML);
		var title = (publishFileDesc.frontMatter || {}).title || publishFileDesc.title;

		// Call the provider
		publishAttributes.provider.publish(publishAttributes, publishFileDesc.frontMatter, title, content, function(error) {
			if(error !== undefined) {
				var errorMsg = error.toString();
				if(errorMsg.indexOf("|removePublish") !== -1) {
					publishFileDesc.removePublishLocation(publishAttributes);
					eventMgr.onPublishRemoved(publishFileDesc, publishAttributes);
				}
				if(errorMsg.indexOf("|stopPublish") !== -1) {
					callback(error);
					return;
				}
			}
			publishLocation(callback, errorFlag || error);
		});
	}

	// Get the html from the onPreviewFinished callback
	var currentHTML;
	eventMgr.addListener("onPreviewFinished", function(htmlWithComments, htmlWithoutComments) {
		currentHTML = {
			withComments: htmlWithComments,
			withoutComments: htmlWithoutComments
		};
	});

	// Listen to offline status changes
	var isOffline = false;
	eventMgr.addListener("onOfflineChanged", function(isOfflineParam) {
		isOffline = isOfflineParam;
	});

	var publishRunning = false;
	publisher.publish = function() {
		// If publish is running or offline
		if(publishRunning === true || isOffline === true) {
			return;
		}

		publishRunning = true;
		eventMgr.onPublishRunning(true);
		publishFileDesc = fileMgr.currentFile;
		publishHTML = currentHTML;
		publishAttributesList = _.values(publishFileDesc.publishLocations);
		publishLocation(function(errorFlag) {
			publishRunning = false;
			eventMgr.onPublishRunning(false);
			if(errorFlag === undefined) {
				eventMgr.onPublishSuccess(publishFileDesc);
			}
		});
	};

	// Generate a publishIndex associated to a file and store publishAttributes
	function createPublishIndex(fileDesc, publishAttributes) {
		var publishIndex;
		do {
			publishIndex = "publish." + utils.id();
		} while(_.has(storage, publishIndex));
		publishAttributes.publishIndex = publishIndex;
		fileDesc.addPublishLocation(publishAttributes);
		eventMgr.onNewPublishSuccess(fileDesc, publishAttributes);
	}

	// Initialize the "New publication" dialog
	var newLocationProvider;

	function initNewLocation(provider) {
		var defaultPublishFormat = provider.defaultPublishFormat || "markdown";
		newLocationProvider = provider;
		$(".publish-provider-name").text(provider.providerName);

		// Show/hide controls depending on provider
		$('.modal-publish [class*=" modal-publish-"]').hide().filter(".modal-publish-" + provider.providerId).show();

		// Reset fields
		utils.resetModalInputs();
		utils.setInputRadio("radio-publish-format", defaultPublishFormat);
		utils.setInputChecked("#checkbox-publish-custom-template", false);
		utils.setInputValue('#textarea-publish-custom-template', settings.template);

		// Load preferences
		var publishPreferences = utils.retrieveIgnoreError(provider.providerId + ".publishPreferences");
		if(publishPreferences) {
			_.each(provider.publishPreferencesInputIds, function(inputId) {
				var publishPreferenceValue = publishPreferences[inputId];
				if(_.isBoolean(publishPreferenceValue)) {
					utils.setInputChecked("#input-publish-" + inputId, publishPreferenceValue);
				}
				else {
					utils.setInputValue("#input-publish-" + inputId, publishPreferenceValue);
				}
			});
			utils.setInputRadio("radio-publish-format", publishPreferences.format);
			utils.setInputChecked("#checkbox-publish-custom-template", publishPreferences.customTmpl !== undefined);
			utils.setInputValue('#textarea-publish-custom-template', publishPreferences.customTmpl || settings.template);
		}

		// Open dialog box
		$(".modal-publish").modal();
	}

	// Add a new publish location to a local document
	function performNewLocation(event) {
		var provider = newLocationProvider;
		var publishAttributes = provider.newPublishAttributes(event);
		if(publishAttributes === undefined) {
			return;
		}

		// Perform provider's publishing
		var fileDesc = fileMgr.currentFile;
		var content = getPublishContent(fileDesc, publishAttributes, currentHTML);
		var title = (fileDesc.frontMatter && fileDesc.frontMatter.title) || fileDesc.title;
		provider.publish(publishAttributes, fileDesc.frontMatter, title, content, function(error) {
			if(error === undefined) {
				publishAttributes.provider = provider;
				createPublishIndex(fileDesc, publishAttributes);
			}
		});

		// Store input values as preferences for next time we open the publish
		// dialog
		var publishPreferences = {};
		_.each(provider.publishPreferencesInputIds, function(inputId) {
			var inputElt = document.getElementById("input-publish-" + inputId);
			if(inputElt.type == 'checkbox') {
				publishPreferences[inputId] = inputElt.checked;
			}
			else {
				publishPreferences[inputId] = inputElt.value;
			}
		});
		publishPreferences.format = publishAttributes.format;
		publishPreferences.customTmpl = publishAttributes.customTmpl;
		storage[provider.providerId + ".publishPreferences"] = JSON.stringify(publishPreferences);
	}

	var initPublishButtonTmpl = [
		'<li>',
		'   <a href="#"',
		'    class="action-init-publish-<%= provider.providerId %>">',
		'       <i class="icon-provider-<%= provider.providerId %>"></i> <%= provider.providerName %>',
		'   </a>',
		'</li>'
	].join('');
	eventMgr.addListener("onReady", function() {
		if(window.viewerMode === false) {
			// Add every provider in the panel menu
			var publishMenuElt = document.querySelector('.menu-panel .publish-on-provider-list');
			var publishMenuHtml = _.reduce(providerMap, function(result, provider) {
				return result + _.template(initPublishButtonTmpl, {
					provider: provider
				});
			}, '');
			publishMenuElt.innerHTML = publishMenuHtml;
			_.each(providerMap, function(provider) {
				// Click on open publish dialog
				$(publishMenuElt.querySelector('.action-init-publish-' + provider.providerId)).click(function() {
					initNewLocation(provider);
				});
				// Click on perform new publication
				$(".action-publish-" + provider.providerId).click(function() {
					initNewLocation(provider);
				});
			});
		}

		$(".action-process-publish").click(performNewLocation);

		var $customTmplCollapseElt = $('.publish-custom-template-collapse').collapse({
			toggle: false
		});
		var $customTmplTextareaElt = $('#textarea-publish-custom-template');
		var doCustomTmplCollapse = _.debounce(function() {
			$customTmplCollapseElt.collapse(utils.getInputRadio("radio-publish-format") == 'template' ? 'show' : 'hide');
		}, 100);
		$("#checkbox-publish-custom-template").change(function() {
			$customTmplTextareaElt.prop('disabled', !this.checked);
		});
		$("input:radio[name=radio-publish-format]").change(function() {
			doCustomTmplCollapse();
		});
		$('.modal-publish').on('hidden.bs.modal', function() {
			$customTmplCollapseElt.collapse('hide');
		});

		// Save As menu items
		$(".action-download-md").click(function() {
			var content = fileMgr.currentFile.content;
			var title = fileMgr.currentFile.title;
			utils.saveAs(content, title + ".md");
		});
		$(".action-download-html").click(function() {
			var title = fileMgr.currentFile.title;
			utils.saveAs(currentHTML.withoutComments, title + ".html");
		});
		$(".action-download-template").click(function() {
			var fileDesc = fileMgr.currentFile;
			var content = publisher.applyTemplate(fileDesc, undefined, currentHTML);
			utils.saveAs(content, fileDesc.title + (settings.template.indexOf("documentHTML") === -1 ? ".md" : ".html"));
		});
		$(".action-download-template-offline").click(function() {
			var fileDesc = fileMgr.currentFile;
			var content = publisher.applyTemplate(fileDesc, undefined, currentHTML);
			content = publisher.cssOuter2Inner(content);
			content = publisher.jsOuter2Inner(content);
			content = publisher.imageOuter2Inner(content);
			utils.saveAs(content, fileDesc.title + (settings.template.indexOf("documentHTML") === -1 ? ".md" : ".html"));
		});
		var monetize = new MonetizeJS({
			applicationID: 'ESTHdCYOi18iLhhO'
		});
		$(".action-download-pdf").click(function() {
			var fileDesc = fileMgr.currentFile;
			var content = publisher.applyTemplate(fileDesc, {
				customTmpl: settings.pdfTemplate
			}, currentHTML);
			var task = new AsyncTask();
			var pdf, token;
			task.onRun(function() {
				if(isOffline === true) {
					eventMgr.onError("Operation not available in offline mode.");
					return task.chain();
				}
				if(!eventMgr.isSponsor) {
					$('.modal-sponsor-only').modal('show');
					return task.chain();
				}
				monetize.getTokenImmediate(function(err, result) {
					token = result;
					task.chain();
				});
			});
			task.onRun(function() {
				if(!token) {
					return task.chain();
				}
				var xhr = new XMLHttpRequest();
				xhr.open('POST', constants.PDF_EXPORT_URL + '?' + $.param({
					token: token,
					options: settings.pdfOptions
				}), true);
				xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
				xhr.responseType = 'blob';
				xhr.onreadystatechange = function() {
					if(this.readyState == 4) {
						if(this.status == 200) {
							pdf = this.response;
						}
						else {
							eventMgr.onError("Error when trying to generate PDF: " + this.statusText);
						}
						task.chain();
					}
				};
				xhr.send(content);
			});
			task.onSuccess(function() {
				pdf && utils.saveAs(pdf, fileMgr.currentFile.title + ".pdf");
			});
			task.enqueue();
		});
	});

	eventMgr.onPublisherCreated(publisher);
	return publisher;
});

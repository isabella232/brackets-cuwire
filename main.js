/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
	"use strict";

	var moduleId = "me.apla.brackets-cuwire";

	var ExtensionUtils     = brackets.getModule("utils/ExtensionUtils"),
		NodeDomain         = brackets.getModule("utils/NodeDomain"),
		PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
		Dialogs            = brackets.getModule("widgets/Dialogs"),
	    DocumentManager    = brackets.getModule("document/DocumentManager"),
		ProjectManager     = brackets.getModule("project/ProjectManager"),
		WorkspaceManager   = brackets.getModule('view/WorkspaceManager'),
		PopUpManager       = brackets.getModule("widgets/PopUpManager");

	var basicDialogMst     = require("text!assets/templates/basic-dialog.mst"),
		boardModsMst       = require("text!assets/templates/board-mods.mst"),
		settingsMst        = require("text!assets/templates/settings.mst");

	var boardMods = Mustache.compile (boardModsMst);
	var settingsRenderer = Mustache.compile (settingsMst);

	var prefs = PreferencesManager.getExtensionPrefs (moduleId);

//	prefs.definePreference ("board", "object", {});
//	prefs.definePreference ("port", "string", null);

	var stateManager = PreferencesManager.stateManager.getPrefixedSystem (moduleId);

//	prefs.definePreference ("panelVisible", "boolean", false);

//	prefs.definePreference ("patterns", "array", []).on("change", function () {
//	});

	var cuwireDomain = new NodeDomain ("cuwire", ExtensionUtils.getModulePath(module, "node/cuwireDomain"));
	ExtensionUtils.loadStyleSheet(module, "assets/style.css");

	function CuWireExt (require, domain) {
		this.domain = domain;
		this.createUI (require);
	}

	var app = brackets.getModule('utils/AppInit');

	CuWireExt.prototype.loadNodePart = function () {

	}


	CuWireExt.prototype.enumerateSerialPorts = function () {
		// TODO: show spinner indicator

		var self = this;

		var cuwirePortDD = $('#cuwire-panel ul.cuwire-port');
		if (!this.portsDDSubscribed) {
			// can't find the working API for this
			var buttonDD = cuwirePortDD.prev("*[data-toggle=\"dropdown\"]");
			buttonDD.on ('click', function () {
				if (!buttonDD.parent ().hasClass ('open')) {
					self.enumerateSerialPorts ();
				}
			});
//			cuwirePortDD.prev().on ('show.bs.dropdown', function () {
//				console.log (123);
//			});
			this.portsDDSubscribed = true;
		}

		$('<li><a href="#">Updating</a></li>').appendTo(cuwirePortDD);

		this.domain.exec("enumerateSerialPorts")
		.done(function (ports) {
			// TODO: get last used port from preference manager
			// TODO: show warning indicator
			// user must select port prior to launch
			console.log(
				"[brackets-cuwire-node] Available ports:",
				ports.map (function (port) {return port.name}).join (", ")
			);
			cuwirePortDD.empty ();
			// tr = $('<tr />').appendTo('#cuwire-panel tbody');

			ports.forEach (function (port) {
				$('<li><a href="#">'+port.name+"</a></li>")
				.on ('click', self.setPort.bind (self, port))
				.appendTo(cuwirePortDD);
			});

			//		$('<td />').text(err.message).appendTo(tr);
			//		$('<td />').text(err.filename).appendTo(tr);
			self.setPort ();
		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-cuwire-node] failed to run cuwire.enumerateSerialPorts, error:", err);
		});

	}

	CuWireExt.prototype.setPort = function (port) {
		// TODO: set port in preferences
		if (!port) {
			port = prefs.get ('port');
			// no preference, first launch
			if (!port)
				return;
		} else {
			prefs.set ('port', port);
		}
		$('#cuwire-panel button.cuwire-port').text (port.name.replace (/^\/dev\/cu\./, ""));
	}

	CuWireExt.prototype.showBoardInfo = function (boardId, platformName) {

		var messageData = {
			images: []
		};

		var newBoard = false;
		if (boardId) {
			if (this.board && boardId !== this.board.id) {
				newBoard = true;
			}
			messageData.infoActive = "active";
		} else {
			boardId      = this.board.id;
			platformName = this.platformName;
			messageData.imageActive = "active";
		}

		var boardMeta = this.platforms[platformName].boards[boardId];
		messageData.mods = boardMeta.mods;

		// imageOK is null when image not found, is undefined when image loading
		// and true if image cached successfully
		if (boardMeta.imageUrl && boardMeta.imageOk !== null) {
			messageData.images.push ({src: boardMeta.imageUrl});
		}

		// render cached mustache template
		var message = boardMods (messageData);

		var formData = {};

		var dlg = Dialogs.showModalDialog (
			'cuwire-board-image',
			this.board.name, // title
			message // dialog body
			// buttons, by default ok button
			// autodismiss, true by default
		).done ((function (buttonId) {
			if (buttonId === "ok") {
				console.log (formData);
				// CommandManager.execute("debug.refreshWindow");
				var boardMod = {};
				if ("menu" in boardMeta) {
					for (var modType in boardMeta.menu) {
						boardMod[modType] = formData[modType];
						if (!boardMod[modType]) {
							console.error ('board modification', modType, 'not defined, continue with caution');
						}
					}
				}
				this.setBoard (boardId, platformName, boardMod);
			}
		}).bind (this));

		var theBoard = this.board;

		var boardModInputs = $("#cuwire-board-mod input");
		// WTF: there is little delay between actual rendering and request to create an dom nodes
		// setTimeout (function () {
			boardModInputs = $("#cuwire-board-mod input");

			// if we had a new board, then we need to discard previous settings
			boardModInputs.each (function (idx) {
				var typeId = $(this).attr('name');
				var modId  = $(this).attr('value');
				if (newBoard) {
					// select every first radio in every mod
					if (!$(this).prev().length) {
						$(this).prop("checked", true);
					}
				} else {
					// select appropriate inputs from prefs
					if (theBoard.mod[typeId] && theBoard.mod[typeId] === modId) {
						$(this).prop("checked", true);
					}
				}
//					console.log( index + ": " + $( this ).text() );
			});

			if (boardModInputs[0] && boardModInputs[0].form) {
				var formEl = boardModInputs[0].form;
				formData = getFormFields (formEl);
			}

		// }, 100);

		// WTF: brackets have no option to prevent dialog close
		// I can use autodismiss: false, but this is not works, really
		// WTF: also, you can't do anything with app with modal window open. even quit app!!!


		boardModInputs.change (function() {
			var formEl = $(this)[0].form;
			formData = getFormFields (formEl);
			console.log (formData);
			console.log ($(this).attr('name'), $(this).attr('value'));
		});


	}

	CuWireExt.prototype.setBoard = function (boardId, platformName, boardMod) {
		if (!boardId) {
			var boardPref = prefs.get ('board');

			// no preference, first launch
			if (!boardPref)
				return;

			boardId      = boardPref[0];
			platformName = boardPref[1];
			boardMod     = boardPref[2];
		} else {
			prefs.set ('board', [boardId, platformName, boardMod]);
		}

		var self = this;
		// TODO: show a message when board unavailable
		var boardMeta = this.platforms[platformName].boards[boardId];

		this.board = {
			id:    boardId,
			meta:  boardMeta,
			name:  boardMeta.name,
			mod:   boardMod
		};

		this.platformName = platformName;

		var titleButton = $('#cuwire-panel button.cuwire-board');
		if (this.platforms[platformName])
			titleButton.text (boardMeta.name);
	}

	function getFormFields (formEl) {
		var formData = {};
		for (var i = 0; i < formEl.elements.length; i ++) {
			var formField = formEl.elements[i];
			if ((formField.type === 'radio' && formField.checked) || formField.type !== 'radio') {
				formData[formField.name] = formField.value;
			}
		}
		return formData;
	}

	CuWireExt.prototype.selectBoardMod = function (boardId, platformName) {
		var boardMeta = this.platforms[platformName].boards[boardId];
		if (!("menu" in boardMeta)) {
			this.setBoard (boardId, platformName);
			return;
		}

		this.showBoardInfo (boardId, platformName);
	}

	CuWireExt.prototype.getBoardImage = function (boardId, platformName) {
		var boardMeta = this.platforms[platformName].boards[boardId];
		var boardImageUrl = require.toUrl ('./assets/board-images/'+boardId+'.jpg');

		boardMeta.imageUrl = boardImageUrl;

		var fs = brackets.getModule ("filesystem/FileSystem");
		var fileObj = fs.getFileForPath (boardImageUrl);

		fileObj.exists (function (err, exists) {
			if (err || !exists) {
				boardMeta.imageOk = null;
				return;
			}
			var bi = new Image ();
			bi.addEventListener ('load',  function () {
//				console.log ('board image load done', arguments);
				boardMeta.imageOk = true;
			}, false);
			bi.addEventListener ('error', function () {
				console.log ('board image file found, but got error on loading', arguments);
				boardMeta.imageOk = null;
			}, false);
			bi.addEventListener ('abort', function () {
				console.log ('board image file found, but got error on loading', arguments);
				boardMeta.imageOk = null;
			}, false);
			bi.src = encodeURI (boardImageUrl);
		})
	}

	CuWireExt.prototype.getBoardMeta = function () {
		// TODO: show spinner indicator

		var self = this;

		// TODO: author's module location - use preferences for this
		// TODO: when we can't find arduino ide in default locations gracefully degrade
		// TODO: add support for energia
		var locations = [];
		if (prefs.get ('arduino-ide')) {
			locations.push (prefs.get ('arduino-ide'));
		}
		if (prefs.get ('energia-ide')) {
			locations.push (prefs.get ('energia-ide'));
		}
		this.domain.exec("getBoardsMeta", locations, [])
		.done(function (platforms) {
			console.log("[brackets-cuwire-node] Available boards:");

			self.platforms = platforms;

			$('#cuwire-panel ul.cuwire-board li').remove();
			// tr = $('<tr />').appendTo('#cuwire-panel tbody');
			var cuwireBoardDD = $('#cuwire-panel ul.cuwire-board');

			console.log (Object.keys (platforms));

			Object.keys (platforms).sort().forEach (function (platformName) {
				console.log (platformName);
				$('<li class="dropdown-header">'
				  + platforms[platformName].platform.name + " "
				  + platforms[platformName].platform.version
				  + "</li>").appendTo(cuwireBoardDD);

				var boards = platforms[platformName].boards;
				Object.keys (boards).sort().map (function (boardId) {
					var boardMeta = boards[boardId];

					self.getBoardImage (boardId, platformName);

					var boardItem = $('<li><a href="#">'+boardMeta.name+"</a></li>");
					boardItem.appendTo(cuwireBoardDD);
					boardItem.on ('click', self.selectBoardMod.bind (self, boardId, platformName));

					var boardDesc = boardMeta.name + ' (' + boardId
					if ("menu" in boardMeta) {
						boardDesc += ', modifications: ';
						var variants = [];

						boardMeta.mods = [];
						var modDesc = {};
						boardMeta.mods.push (modDesc);

						for (var modType in boardMeta.menu) {
							// TODO: use description from arduino menu
							modDesc.typeTitle = modType;
							modDesc.typeId    = modType;
							modDesc.modList   = [];

							variants.push (modType+':');
							var idx = 0;
							for (var mod in boardMeta.menu[modType]) {
								var modTitle = boardMeta.menu[modType][mod][modType + "_modification"];
								variants.push (modTitle);
								modDesc.modList.push ({modTitle: modTitle, modId: mod, index: idx});
								idx++;
							}
						}

						boardDesc += variants.join (" ");

					}
					boardDesc += ')';
					console.log (boardDesc);


				});
			});
			self.setBoard();
		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-cuwire-node] failed to run cuwire.getBoardMeta, error:", err);
		});

	}

	function percentageDegrees (p) {
		p = (p >= 100 ? 100 : p);
		var d = 3.6 * p;
		return d;
	};

	function createGradient (elemPie, elemValue, elemMax, value, max) {
		var p = Math.round (value / (max || value) * 100);
		var d = percentageDegrees (p);
		if (d <= 180) {
			d = 90 + d;
			elemPie.css ('background', 'linear-gradient(90deg, #2c3e50 50%, transparent 50%), linear-gradient('+ d +'deg, #2ecc71 50%, #2c3e50 50%)');
		} else {
			d = d - 90;
			elemPie.css ('background', 'linear-gradient(-90deg, #2ecc71 50%, transparent 50%), linear-gradient('+ d +'deg, #2c3e50 50%, #2ecc71 50%)');
		}
		elemPie.attr ('data-percentage', p);
		elemPie.text (p + '%');
		elemValue.text (value);
		elemMax.text (max || 'n/a');
	}


	CuWireExt.prototype.compileOrUpload = function (mode) {
		var boardMeta = prefs.get ('board');
		var boardId = boardMeta[0];
		var platformName = boardMeta[1];
		var boardMod  = boardMeta[2];
		var options = {};

		if (mode === 'upload') {
			options.serial = {
				port: prefs.get ('port')
			};
		}

		options.includes = prefs.get ('includes');

		var currentDoc = DocumentManager.getCurrentDocument();

		var fullPath = currentDoc.file.fullPath;

		var processStateDiv = $('#cuwire-panel .process-state');
		processStateDiv.removeClass ();
		processStateDiv.addClass ('process-state span2 running');

		// cleanup log before next compile
		$('#cuwire-panel .table-container table tbody tr').remove();

		this.findSketchFolder ((function (err, folder) {

			this.domain.exec (mode, [
				folder,
				platformName,
				boardId,
				boardMod || {},
				options || {}
			])
			.done (function (size) {
				console.log (size);

				processStateDiv.removeClass ();
				processStateDiv.addClass ('process-state span2 success');

			}).fail (function (error) {
				processStateDiv.removeClass ();
				processStateDiv.addClass ('process-state span2 failure');
				console.log (error);
			});
		}).bind (this));
	}

	function getRelativeFilename(basePath, filename) {
		if (!filename || filename.substr(0, basePath.length) !== basePath) {
			return;
		}

		return filename.substr(basePath.length);
	}

	CuWireExt.prototype.findSketchFolder = function (cb) {
		var error;
		ProjectManager.getAllFiles (function (fileName) {
			// searching for ino/pde only
			if (fileName.fullPath.match (/\.(ino|pde)$/))
				return true;
			return false;
		}).done (function (fileList) {

			if (!fileList.length) {
				error = 'cannot find .ino or .pde files within current project';
				cb (error);
				return;
			}

			// only one sketch within project dir, do it!
			if (fileList.length === 1) {
				var sketchFolderPath = fileList[0].parentPath;
				cb (null, sketchFolderPath);
				return;
			}

			var projectRoot = ProjectManager.getProjectRoot();

			// selected file and current document can be different, so check context for both
			var selectedFile = ProjectManager.getSelectedItem();
			var selectedFilePath = selectedFile.fullPath;
			var currentDoc   = DocumentManager.getCurrentDocument();
			var openedFile   = currentDoc.file;
			var openedFilePath = openedFile.fullPath;

			console.log (getRelativeFilename (projectRoot.fullPath, selectedFile.fullPath, openedFile.fullPath));

			var currentSketchFolder;

			fileList.every (function (inoFile) {
				var sketchFolderPath = inoFile.parentPath;

				if (openedFile && getRelativeFilename (sketchFolderPath, openedFilePath)) {
					currentSketchFolder = sketchFolderPath;
					return false;
				} else if (selectedFile && getRelativeFilename (sketchFolderPath, selectedFilePath)) {
					currentSketchFolder = sketchFolderPath;
					return false;
				}
				return true;
			});

			if (currentSketchFolder) {
				// we have selected or opened file somewhere within sketch tree
				cb (null, currentSketchFolder);
				return;
			}

			// TODO: draw a dialog with buttons to handle this
			var message = "<p>Our microcontroller cannot distinguish between available sketches displayed below. "
			+"Please do it manually. We don\'t store your selection because path to the sketch file can be bigger "
			+"than available memory. Sorry!</p><ul class=\"media-list\">";

			message += fileList.sort().map (function (fileObject, fileObjectIdx) {
				var sketchFolderPath = fileObject.parentPath.replace (/\/$/, "");
				var sketchFolder = sketchFolderPath.substr (sketchFolderPath.lastIndexOf ('/') + 1);
				return [
					'<li class="media">',
					'<div class="media-body">',
					'<button data-button-id="cuwire-sketch-'
					+fileObjectIdx
					+'" class="dialog-button btn btn-large pull-right"> </button>',
					'<h4 class="media-heading">'+sketchFolder+'</h4>',
					'<p>'+getRelativeFilename (projectRoot.fullPath, sketchFolderPath)+'</p>',
					'</div>',
					'</li>',
				].join ("\n");
			}).join ('');
			message += '</ul>';

			Dialogs.showModalDialog (
				"cuwire-sketch-select",
				"Please select sketch:",
				message
			).done(function (buttonId) {
				var buttonMatch = buttonId.match (/cuwire-sketch-(\d+)/);
				if (!buttonMatch) {
					// don't care about another buttons
					return;
				}

				var sketchIdx = parseInt (buttonMatch[1]);

				cb (null, fileList[sketchIdx].parentPath);

			});

		});

	}

	CuWireExt.prototype.showSettings = function () {

		var messageData = {
			"arduinoIDE": prefs.get ('arduino-ide'),
			"energiaIDE": prefs.get ('energia-ide')
		};

		var message = settingsRenderer (messageData);

		var formData = {};

		var dlg = Dialogs.showModalDialog (
			'cuwire-settings',
			"cuwire settings", // title
			message // dialog body
			// buttons, by default ok button
			// autodismiss, true by default
		).done ((function (buttonId) {
			if (buttonId === "ok") {
				console.log (formData);
				// CommandManager.execute("debug.refreshWindow");
				prefs.set ('arduino-ide', formData.arduinoIDE);
				prefs.set ('energia-ide', formData.energiaIDE);
				this.getBoardMeta ();
			}
		}).bind (this));

		var theBoard = this.board;

		var boardPrefInputs = $("#cuwire-settings-panel input");
		// WTF: there is little delay between actual rendering and request to create an dom nodes
		// setTimeout (function () {
			boardPrefInputs = $("#cuwire-settings-panel input");
			var formEl = boardPrefInputs[0].form;
			formData = getFormFields (formEl);

		// }, 100);

		boardPrefInputs.change (function() {
			var formEl = $(this)[0].form;
			formData = getFormFields (formEl);
		});

//		$settings.find("#markdown-preview-format")
//		.prop("selectedIndex", _prefs.get("useGFM") ? 1 : 0)
//		.change(function (e) {
//			_prefs.set("useGFM", e.target.selectedIndex === 1);
//			_updateSettings();
//		});
	}

	CuWireExt.prototype.createUI = function (require) {

		var myIcon = $("<a href=\"#\" id=\"cuwire-sidebar-icon\"></a>");

		myIcon.appendTo($("#main-toolbar .buttons"));

		this.panel = WorkspaceManager.createBottomPanel (moduleId+".panel", $(require('text!bottom-panel.html')));

		this.enumerateSerialPorts ();
		this.getBoardMeta ();

		this.panel.toggle = function () {
			if (this.isVisible ()) {
				this.hide ();
			} else {
				this.show ();
			}
			stateManager.set ('panelVisibility', this.isVisible());
		}

		var lastPanelState = stateManager.get ('panelVisibility');
		this.panel.setVisible (lastPanelState);

		myIcon.on ("click", this.panel.toggle.bind (this.panel));
		// we call toggle because you cannot click on close button on hidden panel
		$('#cuwire-panel .close').on('click', this.panel.toggle.bind (this.panel));

		var titleButton = $('#cuwire-panel button.cuwire-board');
		titleButton.on ('click', this.showBoardInfo.bind (this, null, null));

		var compileButton = $('#cuwire-panel button.cuwire-compile');
		compileButton.on ('click', this.compileOrUpload.bind (this, "compile"));

		var uploadButton = $('#cuwire-panel button.cuwire-upload');
		uploadButton.on ('click', this.compileOrUpload.bind (this, "upload"));

		var settingsButton = $('#cuwire-panel button.cuwire-settings');
		settingsButton.on ('click', this.showSettings.bind (this));

		$(this.domain).on ('log', function (event, scope, message, payload) {
//			console.log (message);

			var highlight = '';
			if (payload && payload.stderr) {
				highlight = 'error';
			} else if (payload && payload.maxText) {
//				var textSizeP = Math.round (payload.text / payload.maxText * 100);
				createGradient ($('.pie.pie-text'), $('.pie-label.pie-text .value'), $('.pie-label.pie-text .full'), payload.text, payload.maxText);
//				var dataSizeP = Math.round (payload.data / (payload.maxData || payload.data) * 100);
				createGradient ($('.pie.pie-data'), $('.pie-label.pie-data .value'), $('.pie-label.pie-data .full'), payload.data, payload.maxData);
				// createGradient ($('.pie-eeprom'), percentageDegrees (0), 0);

			} else if (message.match (/^done(?:\s|$)/)) {
				highlight = 'done';
			}

			$('#cuwire-panel .table-container table tbody').append ("<tr class=\""+highlight+"\"><td>"+scope+"</td><td>"+message+"</td></tr>");
			var rowpos = $('#cuwire-panel .table-container table tbody tr:last').position();

			// TODO: fix scroll
			// http://stackoverflow.com/questions/1805808/how-do-i-scroll-a-row-of-a-table-into-view-element-scrollintoview-using-jquery
			// $('#container').scrollTop( $('#tr').offset().top - $('#td').offset().top )
			$('#cuwire-panel .table-container').scrollTop(rowpos.top);
		});
	}


	app.appReady(function(){
		//		$(brackets.getModule('document/DocumentManager')).on('documentSaved', onDocumentSaved);

		var cuwireExt = new CuWireExt (require, cuwireDomain);
	});

});

module.exports = function(grunt) {

function htmlEscape(text) {
	return text
		// supports keeping markup in source file, but drop from inline sample
		.replace(/<!-- @placeholder-start\((.+)\) -->[\s\S]+@placeholder-end -->/g, function(match, input) {
			return "<-- " + input + " -->";
		})
		.replace(/&/g,'&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

var // modules
	fs = require( "fs" ),
	cheerio = require( "cheerio" ),
	nsh = require( "node-syntaxhighlighter" ),
	path = require( "path" );

grunt.registerMultiTask( "build-pages", "Process html and markdown files as pages, include @partials and syntax higlight code snippets", function() {
	var content,
		task = this,
		taskDone = task.async(),
		files = this.data,
		targetDir = grunt.config( "wordpress.dir" ) + "/posts/page/";

	grunt.file.mkdir( targetDir );

	grunt.utils.async.forEachSeries( files, function( fileName, fileDone ) {
		var post = grunt.helper( "wordpress-parse-post", fileName ),
			content = post.content,
			fileType = /\.(\w+)$/.exec( fileName )[ 1 ],
			targetFileName = targetDir + fileName.replace( /^.+?\/(.+)\.\w+$/, "$1" ) + ".html";

		grunt.verbose.write( "Processing " + fileName + "..." );
		delete post.content;

		// Convert markdown to HTML
		if ( fileType === "md" ) {
			content = grunt.helper( "parse-markdown", content, post.toc );
			delete post.toc;
		}

		// Replace partials
		content = content.replace( /@partial\((.+)\)/g, function( match, input ) {
			return htmlEscape( grunt.file.read( input ) );
		});

		// Syntax highlight code blocks
		if ( !grunt.option( "nohighlight" ) ) {
			content = grunt.helper( "syntax-highlight", { content: content } );
		}

		// Write file
		grunt.file.write( targetFileName,
			"<script>" + JSON.stringify( post ) + "</script>\n" + content );

		fileDone();
	}, function() {
		if ( task.errorCount ) {
			grunt.warn( "Task \"" + task.name + "\" failed." );
			taskDone();
			return;
		}
		grunt.log.writeln( "Built " + files.length + " pages." );
		taskDone();
	});
});

grunt.registerMultiTask( "build-resources", "Copy resources", function() {
	var task = this,
		taskDone = task.async(),
		files = this.data,
		targetDir = grunt.config( "wordpress.dir" ) + "/resources/";

	grunt.file.mkdir( targetDir );

	grunt.utils.async.forEachSeries( files, function( fileName, fileDone )  {
		grunt.file.copy( fileName, targetDir + fileName.replace( /^.+?\//, "" ) );
		fileDone();
	}, function() {
		if ( task.errorCount ) {
			grunt.warn( "Task \"" + task.name + "\" failed." );
			taskDone();
			return;
		}
		grunt.log.writeln( "Built " + files.length + " resources." );
		taskDone();
	});
});

grunt.registerHelper( "syntax-highlight", function( options ) {

	// receives the innerHTML of a <code> element and if the first character
	// is an encoded left angle bracket, we'll assume the language is html
	function crudeHtmlCheck ( input ) {
		return input.trim().indexOf( "&lt;" ) === 0 ? "html" : "";
	}

	// when parsing the class attribute, make sure a class matches an actually
	// highlightable language, instead of being presentational (e.g. 'example')
	function getLanguageFromClass( str ) {
		str = str || "";
		var classes = str.split(" "),
		c = classes.length;
		while ( --c ) {
			if ( nsh.getLanguage( classes[c] ) ) {
				return classes[c];
			}
		}
		return "";
	}

	var html = options.file ? grunt.file.read( options.file ) : options.content,
		$ = cheerio.load( html );

	$( "pre > code" ).each( function( index, el ) {
		var $t = $( this ),
			code = $t.html(),
			lang = $t.attr( "data-lang" ) ||
				getLanguageFromClass( $t.attr( "class" ) ) ||
				crudeHtmlCheck( code ),
			linenumAttr = $t.attr( "data-linenum" ),
			linenum = (linenumAttr === "true" ? 1 : linenumAttr) || 1,
			gutter = linenumAttr === undefined ? false : true,
			brush = nsh.getLanguage( lang ) || nsh.getLanguage( "js" ),
			highlighted = nsh.highlight( code, brush, {
				"first-line": linenum,
				gutter: gutter
			});
		$t.parent().replaceWith( $( highlighted ).removeAttr( "id" ) );
	});

	return $.html();
});

grunt.registerHelper( "parse-markdown", function( src, generateToc ) {
	var toc = "",
		marked = require( "marked" ),
		tokens = marked.lexer( src );

	if ( generateToc ) {
		tokens.filter(function( item ) {
			if ( item.type !== "heading" ) {
				return false;
			}

			item.tocText = item.text;
			item.tocId = item.text
				.replace( /\W+/g, "-" )
				.replace( /^-+|-+$/, "" )
				.toLowerCase();
			item.text += " <a href='#" + item.tocId + "' id='" + item.tocId + "'>link</a>";
			return true;
		}).forEach(function( item ) {
			toc += Array( (item.depth - 1) * 2 + 1 ).join( " " ) + "* " +
				"[" + item.tocText + "](#" + item.tocId + ")\n";
		});

		tokens = marked.lexer( toc ).concat( tokens );
	}

	return marked.parser( tokens );
});

};

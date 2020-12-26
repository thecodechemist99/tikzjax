const gulp = require('gulp');
const download = require('gulp-download2');
const decompress = require('gulp-decompress');
const filter = require('gulp-filter');

gulp.task('download-fonts',
	() => download('http://mirrors.ctan.org/fonts/cm/ps-type1/bakoma.zip').pipe(gulp.dest('./'))
);

gulp.task('install-fonts',
	function() {
		return gulp.src('bakoma.zip')
			.pipe(decompress())
			.pipe(filter(['**/*.ttf']))
			.pipe(gulp.dest("dist"));
	});

gulp.task('default', defaultTask);
function defaultTask(done) {
	// place code for your default task here
	done();
}

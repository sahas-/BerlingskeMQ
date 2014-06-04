var gulp = require('gulp');
var jshint = require('gulp-jshint');
var spawn = require('child_process').spawn;
var os = require('os');

gulp.task('default', function () {
  console.log('=================');
  console.log('Usage:');
  console.log('     gulp start');
  console.log('     gulp watch');
  console.log('     gulp lint');
  console.log('     gulp test');
  console.log('     gulp build');
  console.log('=================');
});

var workerid = os.hostname() + '-test';

var node;
gulp.task('start', function() {
  if (node) {
    node.kill();
  }
  node = spawn('node', ['./src/worker.js', workerid], {stdio: 'inherit'});
});

var node_inspector;
gulp.task('debug', function() {
  if (node) {
    node.kill();
  }
  node = spawn('node', ['--debug=5858', './src/worker.js', workerid], {stdio: 'inherit'});

  if (node_inspector) {
    node_inspector.kill();
  }
  node_inspector = spawn('node-inspector', ['--web-port=8000'], {stdio: 'inherit'});
});

gulp.task('watch', ['debug'], function () {
  var watcher = gulp.watch('./src/**/*.js', ['debug']);
  watcher.on('change', function(event) {
    console.log('File '+event.path+' was '+event.type+', running tasks...');
  });
});

gulp.task('lint', function() {
  gulp.src('./src/**/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('build', ['lint', 'test'], function() {
  // TODO
});
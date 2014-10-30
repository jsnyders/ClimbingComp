module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        copy: {
            clientDeps: {
                files: [
                    {
                        expand: true,
                        flatten: true,
                        src: [
                            "bower_components/jquery/dist/*",
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.js",
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.min.js",
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.min.map",
                            "bower_components/jquery-ui/development-bundle/ui/jquery.ui.datepicker.js",
                            "bower_components/jquery-ui/development-bundle/ui/minified/jquery.ui.datepicker.min.js",
                            "bower_components/jquery-mobile-datepicker-wrapper/jquery.mobile.datepicker.js"
                        ],
                        dest:"client/js/lib/"
                    },
                    {
                        expand: true,
                        flatten: true,
                        src: [
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.css",
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.min.css",
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.min.map",
                            "bower_components/jquery-mobile/jquery.mobile-1.4.4.min.map",
                            "bower_components/jquery-mobile-datepicker-wrapper/jquery.mobile.datepicker*.css"
                        ],
                        dest:"client/css/lib/"
                    },
                    {
                        expand: true,
                        cwd: "bower_components/jquery-mobile",
                        src: [
                            "images/**",
                        ],
                        dest:"client/css/lib/"
                    }
                ]
            }
        },
        uglify: {
            options: {
                banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
            },
            build: {
                src: 'src/<%= pkg.name %>.js',
                dest: 'build/<%= pkg.name %>.min.js'
            }
        },
        jshint: {
            options: {
                bitwise: true,
                curly: true,
                eqeqeq: true,
                indent: 4,
                plusplus: false,
                undef: true,
                unused: true
            },
            client: {
                options: {
                    browser: true,
                    strict: true,
                    globals: {
                        jQuery: true
                    }
                },
                src: ['client/js/*.js']
            },
            server: {
                options: {
                    node: true
                },
                src: ['lib/*.js', 'main.js']
            }
        }
    });

    //
    // Load tasks
    //

    grunt.loadNpmTasks('grunt-contrib-copy');

    grunt.loadNpmTasks('grunt-contrib-jshint');

    grunt.loadNpmTasks('grunt-contrib-uglify');

    //
    // Define tasks
    //

    // Default task(s).
    grunt.registerTask('setup', ['copy:clientDeps']);
    grunt.registerTask('default', ['uglify']);

};
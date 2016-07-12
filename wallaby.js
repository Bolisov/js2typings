module.exports = function (wallaby) {
    return {
        files: ['src/*.ts'],
        tests: ['test/*.ts', 'test/parser/**.*'],
        env: {
            type: 'node'
        },
        testFramework: 'mocha'        
    };
};
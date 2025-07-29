module.exports = {
    root: true,
    extends: ['@nuxt/eslint-config'],
    rules: {
        // Global
        // semi: ['error', 'never'],
        quotes: ['error', 'single'],
        'quote-props': ['error', 'as-needed'],
        // Vue
        // 'vue/multi-word-component-names': 0,
        'vue/max-attributes-per-line': [
            'warn',
            {
                singleline: {
                    max: 5,
                },
            },
        ],
        // 'vue/no-v-html': 0,
        // 'vue/html-indent': ['warn', 4],
        'vue/html-indent': 0,
        'vue/html-self-closing': [
            'warn',
            {
                html: {
                    void: 'always',
                },
            },
        ],
        'vue/singleline-html-element-content-newline': 0,
    },
};

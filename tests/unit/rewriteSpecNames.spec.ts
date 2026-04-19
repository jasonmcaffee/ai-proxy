import { rewriteSpecText } from '../../scripts/rewrite-spec-names';

/** Runs the rewrite logic on a plain object by round-tripping through JSON. */
function rewrite(spec: object): object {
  return JSON.parse(rewriteSpecText(JSON.stringify(spec)));
}

describe('rewriteSpecText', () => {
  it('strips Dto suffix from component schema keys', () => {
    const spec = {
      components: {
        schemas: {
          FooDto: { type: 'object' },
          BarBazDto: { type: 'object' },
          NoSuffix: { type: 'object' },
        },
      },
    };

    const result = rewrite(spec) as any;
    expect(result.components.schemas['Foo']).toBeDefined();
    expect(result.components.schemas['BarBaz']).toBeDefined();
    expect(result.components.schemas['NoSuffix']).toBeDefined();
    expect(result.components.schemas['FooDto']).toBeUndefined();
    expect(result.components.schemas['BarBazDto']).toBeUndefined();
  });

  it('rewrites $ref paths to remove Dto suffix', () => {
    const spec = {
      paths: {
        '/v1/test': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FooDto' },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          FooDto: { type: 'object', properties: { bar: { $ref: '#/components/schemas/BarDto' } } },
          BarDto: { type: 'object' },
        },
      },
    };

    const result = rewrite(spec) as any;
    const ref = result.paths['/v1/test'].post.requestBody.content['application/json'].schema['$ref'];
    expect(ref).toBe('#/components/schemas/Foo');

    const barRef = result.components.schemas['Foo'].properties.bar['$ref'];
    expect(barRef).toBe('#/components/schemas/Bar');
  });

  it('leaves schema names without Dto suffix untouched', () => {
    const spec = {
      components: { schemas: { MyModel: { type: 'object' } } },
    };

    const result = rewrite(spec) as any;
    expect(result.components.schemas['MyModel']).toBeDefined();
  });

  it('renames operationId createCompletion to create', () => {
    const spec = {
      paths: {
        '/v1/chat/completions': {
          post: { operationId: 'createCompletion', tags: ['chat'] },
        },
      },
    };

    const result = rewrite(spec) as any;
    expect(result.paths['/v1/chat/completions'].post.operationId).toBe('create');
  });

  it('retagsthe chat completions path to ChatCompletions', () => {
    const spec = {
      paths: {
        '/v1/chat/completions': {
          post: { operationId: 'createCompletion', tags: ['chat'] },
        },
      },
    };

    const result = rewrite(spec) as any;
    expect(result.paths['/v1/chat/completions'].post.tags).toContain('ChatCompletions');
  });
});

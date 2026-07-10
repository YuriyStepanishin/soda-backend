export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SODA Backend API',
    version: '1.0.0',
    description: 'API documentation for SODA backend services.',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local development',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Sales' },
    { name: 'Uploads' },
    { name: 'Google Drive' },
    { name: 'Imports' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'y.stepanishin@gmail.com',
          },
          password: { type: 'string', example: 'secret123' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', example: 'oldSecret123' },
          newPassword: {
            type: 'string',
            minLength: 6,
            example: 'newSecret123',
          },
        },
      },
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email' },
          role: {
            type: 'string',
            enum: ['admin', 'manager', 'supervisor', 'agent', 'brand_manager'],
          },
          department: { type: 'string', nullable: true },
          departments: {
            type: 'array',
            items: { type: 'string' },
          },
          representative: { type: 'string', nullable: true },
          brands: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: { $ref: '#/components/schemas/AuthUser' },
            },
          },
        },
      },
      GenericSuccess: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Access denied' },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Service health check',
        responses: {
          200: {
            description: 'API is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'SODA API працює' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change current user password',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChangePasswordRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Password updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        updated: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/sales': {
      get: {
        tags: ['Sales'],
        summary: 'Get sales list with filters and pagination',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
          },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'brand', in: 'query', schema: { type: 'string' } },
          { name: 'agent', in: 'query', schema: { type: 'string' } },
          {
            name: 'dateFrom',
            in: 'query',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'dateTo',
            in: 'query',
            schema: { type: 'string', format: 'date' },
          },
        ],
        responses: {
          200: {
            description: 'Sales list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { type: 'object' } },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 50 },
                        total: { type: 'integer', example: 1200 },
                        pages: { type: 'integer', example: 24 },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/sales/{salesId}': {
      get: {
        tags: ['Sales'],
        summary: 'Get sale by id',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'salesId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: {
            description: 'Sale found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid id' },
          404: { description: 'Not found' },
        },
      },
    },
    '/api/upload': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload sales Excel file',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Sales uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    inserted: { type: 'integer', example: 1500 },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (admin/manager only)' },
        },
      },
    },
    '/api/upload/photos': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload image to Cloudinary',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['photo'],
                properties: {
                  photo: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Photo uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    imageUrl: {
                      type: 'string',
                      example: 'https://res.cloudinary.com/.../image.jpg',
                    },
                    publicId: {
                      type: 'string',
                      example: 'soda-reports/sample-id',
                    },
                    asset: { type: 'object' },
                  },
                },
              },
            },
          },
          400: { description: 'Photo is missing' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/prices/upload': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload prices Excel file',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Prices uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    updated: { type: 'integer', example: 450 },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (admin/manager only)' },
        },
      },
    },
    '/api/google-drive': {
      get: {
        tags: ['Google Drive'],
        summary: 'Get source Excel files from Google Drive folder',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Files list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (admin/manager only)' },
        },
      },
    },
    '/api/imports/run': {
      get: {
        tags: ['Imports'],
        summary: 'Run Google Drive import flow',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Import completed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Import completed' },
                    summary: {
                      type: 'object',
                      properties: {
                        found: { type: 'integer', example: 4 },
                        processed: { type: 'integer', example: 4 },
                        archived: { type: 'integer', example: 4 },
                        failed: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              fileId: { type: 'string' },
                              fileName: { type: 'string' },
                              error: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (admin only)' },
          500: {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
};

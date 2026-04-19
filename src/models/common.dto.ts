import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty()
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export class ModelObjectDto {
  @ApiProperty({ example: 'local-model' })
  id: string;

  @ApiProperty({ example: 'model' })
  object: string;

  @ApiProperty()
  created: number;

  @ApiProperty({ example: 'llama.cpp' })
  owned_by: string;
}

export class ModelsListResponseDto {
  @ApiProperty({ example: 'list' })
  object: string;

  @ApiProperty({ type: [ModelObjectDto] })
  data: ModelObjectDto[];
}

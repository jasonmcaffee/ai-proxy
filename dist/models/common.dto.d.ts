export declare class ErrorResponseDto {
    error: {
        message: string;
        type: string;
        code?: string;
    };
}
export declare class ModelObjectDto {
    id: string;
    object: string;
    created: number;
    owned_by: string;
}
export declare class ModelsListResponseDto {
    object: string;
    data: ModelObjectDto[];
}

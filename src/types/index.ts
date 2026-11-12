export type MealType = string;

export interface MealSlot {
  id: string;
  label: string;
  timeHint: string;
  icon: string;
}

export type PrepState =
  | 'cru'
  | 'cozido'
  | 'grelhado'
  | 'assado'
  | 'refogado'
  | 'frito'
  | 'no_vapor';

export type NutritionSource =
  | 'TACO'
  | 'TBCA'
  | 'USDA'
  | 'Open Food Facts'
  | 'Rótulo OCR'
  | 'IA'
  | 'Manual';

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  per100g?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
    sodium?: number;
  };
  prepState: PrepState;
  portionGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: NutritionSource;
  householdMeasure?: string;
  verified?: boolean;
}

export interface MealLog {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  title: string;
  foods: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  photoUrl?: string;
  confidenceNotes?: string;
  createdAt: string;
}

export interface MarmitaItem {
  id: string;
  foodName: string;
  prepState: PrepState;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Marmita {
  id: string;
  name: string;
  description: string;
  photoUrl?: string;
  prepNotes?: string;
  items: MarmitaItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  createdAt: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  grams?: number;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  photoUrl?: string;
  prepTimeMinutes: number;
  servings: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
  fiberPerServing: number;
  isFavorite: boolean;
  ingredients: RecipeIngredient[];
  instructions: string[];
  carinhoTip?: string;
  createdAt: string;
}

export interface WeeklyPlanItem {
  id: string;
  mealType: MealType;
  title: string;
  marmitaId?: string;
  recipeId?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type DayOfWeek =
  | 'segunda'
  | 'terca'
  | 'quarta'
  | 'quinta'
  | 'sexta'
  | 'sabado'
  | 'domingo';

export type WeeklyPlan = Record<DayOfWeek, WeeklyPlanItem[]>;

export interface UserProfile {
  name: string;
  email: string;
  calorieGoal: number;
  macros: {
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
  };
  waterGoalMl: number;
  waterDrankMl: number;
  currentWeightKg: number;
  targetWeightKg: number;
  heightCm: number;
  dietPreference?: string;
}

export interface AppState {
  user: UserProfile;
  todayLogs: MealLog[];
  historyLogs: MealLog[];
  marmitas: Marmita[];
  recipes: Recipe[];
  weeklyPlan: WeeklyPlan;
  customFoods: FoodItem[];
  mealSlots?: MealSlot[];
  lastUpdated?: string;
}

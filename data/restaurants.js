// ─── Restaurant Chain Nutrition Database ─────────────────────
// 40+ US restaurant chains with common menu items.
// Data sourced from official nutrition PDFs (public information).

export const RESTAURANT_DB = {

    // ── Burger / Fast Food ────────────────────────────────────

    mcdonalds: {
        name: "McDonald's",
        aliases: ["mcdonald", "mcdonalds", "mcd", "big mac", "mcnugget", "mcflurry", "quarter pounder"],
        items: {
            "big_mac": { calories: 550, protein: 25, carbs: 45, fat: 30, fiber: 3, sodium: 1010, grams: 214 },
            "quarter_pounder_cheese": { calories: 520, protein: 30, carbs: 42, fat: 26, fiber: 2, sodium: 1110, grams: 199 },
            "double_quarter_pounder": { calories: 740, protein: 48, carbs: 43, fat: 42, fiber: 3, sodium: 1280, grams: 280 },
            "mcnuggets_10": { calories: 420, protein: 24, carbs: 26, fat: 25, fiber: 1, sodium: 850, grams: 162 },
            "mcnuggets_6": { calories: 250, protein: 15, carbs: 15, fat: 15, fiber: 0, sodium: 510, grams: 97 },
            "mcnuggets_20": { calories: 830, protein: 48, carbs: 50, fat: 49, fiber: 2, sodium: 1670, grams: 324 },
            "large_fries": { calories: 490, protein: 7, carbs: 66, fat: 23, fiber: 6, sodium: 400, grams: 178 },
            "medium_fries": { calories: 320, protein: 4, carbs: 44, fat: 15, fiber: 4, sodium: 260, grams: 117 },
            "small_fries": { calories: 220, protein: 3, carbs: 30, fat: 10, fiber: 3, sodium: 180, grams: 80 },
            "filet_o_fish": { calories: 390, protein: 17, carbs: 39, fat: 19, fiber: 1, sodium: 590, grams: 142 },
            "mcchicken": { calories: 400, protein: 14, carbs: 40, fat: 21, fiber: 1, sodium: 590, grams: 154 },
            "crispy_chicken_sandwich": { calories: 530, protein: 27, carbs: 59, fat: 22, fiber: 3, sodium: 1130, grams: 242 },
            "egg_mcmuffin": { calories: 310, protein: 17, carbs: 30, fat: 13, fiber: 2, sodium: 820, grams: 138 },
            "sausage_mcmuffin_egg": { calories: 480, protein: 21, carbs: 30, fat: 31, fiber: 2, sodium: 1050, grams: 165 },
            "hotcakes": { calories: 580, protein: 9, carbs: 102, fat: 15, fiber: 3, sodium: 830, grams: 261 },
            "medium_chocolate_shake": { calories: 630, protein: 15, carbs: 89, fat: 25, fiber: 1, sodium: 360, grams: 503 },
            "apple_pie": { calories: 230, protein: 2, carbs: 33, fat: 11, fiber: 2, sodium: 95, grams: 77 },
        }
    },

    burgerking: {
        name: "Burger King",
        aliases: ["burger king", "whopper", "bk"],
        items: {
            "whopper": { calories: 660, protein: 28, carbs: 49, fat: 40, fiber: 2, sodium: 980, grams: 291 },
            "whopper_jr": { calories: 310, protein: 15, carbs: 27, fat: 16, fiber: 1, sodium: 390, grams: 159 },
            "double_whopper": { calories: 900, protein: 48, carbs: 49, fat: 57, fiber: 2, sodium: 1040, grams: 373 },
            "original_chicken": { calories: 660, protein: 21, carbs: 52, fat: 40, fiber: 2, sodium: 1010, grams: 228 },
            "crispy_chicken_sandwich": { calories: 660, protein: 26, carbs: 57, fat: 37, fiber: 2, sodium: 1200, grams: 240 },
            "large_fries": { calories: 430, protein: 5, carbs: 53, fat: 22, fiber: 4, sodium: 570, grams: 160 },
            "medium_fries": { calories: 320, protein: 4, carbs: 40, fat: 16, fiber: 3, sodium: 430, grams: 117 },
            "impossible_whopper": { calories: 630, protein: 25, carbs: 58, fat: 34, fiber: 4, sodium: 1080, grams: 272 },
            "chicken_fries_9": { calories: 280, protein: 19, carbs: 20, fat: 13, fiber: 1, sodium: 840, grams: 123 },
            "onion_rings_medium": { calories: 320, protein: 4, carbs: 38, fat: 17, fiber: 3, sodium: 480, grams: 91 },
        }
    },

    wendys: {
        name: "Wendy's",
        aliases: ["wendys", "wendy's", "dave's single", "baconator", "frosty"],
        items: {
            "daves_single": { calories: 590, protein: 30, carbs: 41, fat: 32, fiber: 2, sodium: 1090, grams: 254 },
            "daves_double": { calories: 820, protein: 50, carbs: 41, fat: 50, fiber: 2, sodium: 1340, grams: 345 },
            "baconator": { calories: 950, protein: 57, carbs: 37, fat: 62, fiber: 1, sodium: 1790, grams: 368 },
            "spicy_chicken_sandwich": { calories: 500, protein: 27, carbs: 51, fat: 20, fiber: 2, sodium: 1130, grams: 215 },
            "classic_chicken_sandwich": { calories: 470, protein: 25, carbs: 51, fat: 17, fiber: 2, sodium: 1030, grams: 215 },
            "small_chili": { calories: 170, protein: 15, carbs: 16, fat: 5, fiber: 4, sodium: 780, grams: 227 },
            "large_chili": { calories: 290, protein: 23, carbs: 30, fat: 9, fiber: 7, sodium: 1290, grams: 454 },
            "large_fries": { calories: 480, protein: 7, carbs: 66, fat: 22, fiber: 6, sodium: 570, grams: 186 },
            "medium_fries": { calories: 340, protein: 5, carbs: 45, fat: 16, fiber: 4, sodium: 390, grams: 130 },
            "frosty_medium_chocolate": { calories: 460, protein: 12, carbs: 76, fat: 12, fiber: 0, sodium: 280, grams: 397 },
            "caesar_salad": { calories: 400, protein: 28, carbs: 16, fat: 25, fiber: 3, sodium: 900, grams: 340 },
        }
    },

    inout: {
        name: "In-N-Out Burger",
        aliases: ["in-n-out", "in n out", "innout", "double double", "animal style"],
        items: {
            "hamburger": { calories: 390, protein: 16, carbs: 39, fat: 19, fiber: 3, sodium: 650, grams: 243 },
            "cheeseburger": { calories: 480, protein: 22, carbs: 39, fat: 27, fiber: 3, sodium: 1000, grams: 268 },
            "double_double": { calories: 670, protein: 37, carbs: 39, fat: 41, fiber: 3, sodium: 1440, grams: 330 },
            "double_double_animal_style": { calories: 750, protein: 40, carbs: 45, fat: 46, fiber: 4, sodium: 1520, grams: 380 },
            "protein_style_cheeseburger": { calories: 330, protein: 21, carbs: 11, fat: 25, fiber: 3, sodium: 720, grams: 300 },
            "french_fries": { calories: 395, protein: 7, carbs: 54, fat: 18, fiber: 2, sodium: 245, grams: 125 },
            "animal_style_fries": { calories: 750, protein: 9, carbs: 60, fat: 54, fiber: 4, sodium: 1000, grams: 400 },
            "chocolate_shake": { calories: 590, protein: 9, carbs: 83, fat: 26, fiber: 0, sodium: 360, grams: 425 },
            "vanilla_shake": { calories: 580, protein: 9, carbs: 78, fat: 26, fiber: 0, sodium: 390, grams: 425 },
        }
    },

    fiveguys: {
        name: "Five Guys",
        aliases: ["five guys", "fiveguys"],
        items: {
            "hamburger": { calories: 700, protein: 33, carbs: 40, fat: 43, fiber: 2, sodium: 430, grams: 284 },
            "cheeseburger": { calories: 840, protein: 40, carbs: 40, fat: 55, fiber: 2, sodium: 900, grams: 319 },
            "bacon_cheeseburger": { calories: 920, protein: 46, carbs: 40, fat: 62, fiber: 2, sodium: 1310, grams: 340 },
            "little_hamburger": { calories: 480, protein: 22, carbs: 39, fat: 26, fiber: 2, sodium: 381, grams: 220 },
            "little_cheeseburger": { calories: 550, protein: 26, carbs: 39, fat: 32, fiber: 2, sodium: 690, grams: 243 },
            "veggie_sandwich": { calories: 440, protein: 11, carbs: 60, fat: 15, fiber: 4, sodium: 1040, grams: 280 },
            "regular_fries": { calories: 953, protein: 13, carbs: 131, fat: 41, fiber: 9, sodium: 962, grams: 411 },
            "little_fries": { calories: 526, protein: 7, carbs: 72, fat: 23, fiber: 5, sodium: 531, grams: 227 },
            "hot_dog": { calories: 415, protein: 14, carbs: 40, fat: 23, fiber: 2, sodium: 975, grams: 180 },
        }
    },

    shakeshack: {
        name: "Shake Shack",
        aliases: ["shake shack", "shakeshack", "shackburger"],
        items: {
            "shackburger": { calories: 500, protein: 24, carbs: 40, fat: 27, fiber: 1, sodium: 880, grams: 200 },
            "double_shackburger": { calories: 770, protein: 41, carbs: 41, fat: 48, fiber: 1, sodium: 1185, grams: 303 },
            "shroom_burger": { calories: 590, protein: 22, carbs: 43, fat: 38, fiber: 3, sodium: 990, grams: 280 },
            "smoke_shack": { calories: 580, protein: 27, carbs: 41, fat: 34, fiber: 1, sodium: 1190, grams: 236 },
            "chicken_shack": { calories: 560, protein: 30, carbs: 46, fat: 27, fiber: 2, sodium: 1200, grams: 224 },
            "crinkle_cut_fries": { calories: 470, protein: 6, carbs: 60, fat: 23, fiber: 5, sodium: 410, grams: 190 },
            "cheese_fries": { calories: 740, protein: 14, carbs: 68, fat: 47, fiber: 5, sodium: 1060, grams: 300 },
            "concrete_vanilla": { calories: 780, protein: 14, carbs: 94, fat: 40, fiber: 0, sodium: 420, grams: 454 },
        }
    },

    // ── Chicken ───────────────────────────────────────────────

    chickfila: {
        name: "Chick-fil-A",
        aliases: ["chick-fil-a", "chickfila", "chick fil a", "spicy deluxe", "chick-fil-a"],
        items: {
            "chicken_sandwich": { calories: 440, protein: 28, carbs: 40, fat: 19, fiber: 1, sodium: 1350, grams: 196 },
            "spicy_chicken_sandwich": { calories: 460, protein: 29, carbs: 42, fat: 19, fiber: 1, sodium: 1670, grams: 200 },
            "spicy_deluxe": { calories: 550, protein: 32, carbs: 45, fat: 26, fiber: 2, sodium: 1720, grams: 232 },
            "grilled_chicken_sandwich": { calories: 320, protein: 29, carbs: 40, fat: 6, fiber: 3, sodium: 800, grams: 206 },
            "nuggets_8": { calories: 250, protein: 26, carbs: 11, fat: 11, fiber: 0, sodium: 680, grams: 113 },
            "nuggets_12": { calories: 380, protein: 38, carbs: 17, fat: 17, fiber: 0, sodium: 1020, grams: 170 },
            "grilled_nuggets_8": { calories: 130, protein: 25, carbs: 2, fat: 3, fiber: 0, sodium: 440, grams: 113 },
            "waffle_fries_medium": { calories: 420, protein: 6, carbs: 50, fat: 22, fiber: 5, sodium: 280, grams: 153 },
            "waffle_fries_large": { calories: 530, protein: 7, carbs: 63, fat: 28, fiber: 6, sodium: 350, grams: 191 },
            "mac_and_cheese": { calories: 440, protein: 17, carbs: 44, fat: 22, fiber: 2, sodium: 1020, grams: 247 },
            "coleslaw": { calories: 240, protein: 2, carbs: 26, fat: 14, fiber: 2, sodium: 220, grams: 128 },
            "chicken_soup": { calories: 140, protein: 9, carbs: 18, fat: 4, fiber: 1, sodium: 1090, grams: 255 },
            "milkshake_chocolate": { calories: 590, protein: 12, carbs: 82, fat: 26, fiber: 0, sodium: 360, grams: 454 },
        }
    },

    popeyes: {
        name: "Popeyes",
        aliases: ["popeyes", "popeye's", "popeyes chicken"],
        items: {
            "chicken_sandwich": { calories: 700, protein: 28, carbs: 50, fat: 42, fiber: 2, sodium: 1443, grams: 229 },
            "spicy_chicken_sandwich": { calories: 700, protein: 28, carbs: 49, fat: 42, fiber: 2, sodium: 1600, grams: 229 },
            "3pc_chicken_combo": { calories: 680, protein: 40, carbs: 42, fat: 37, fiber: 3, sodium: 1790, grams: 340 },
            "breast_piece": { calories: 380, protein: 30, carbs: 9, fat: 25, fiber: 1, sodium: 1050, grams: 161 },
            "chicken_tenders_3": { calories: 310, protein: 20, carbs: 17, fat: 17, fiber: 1, sodium: 800, grams: 140 },
            "mashed_potatoes": { calories: 110, protein: 2, carbs: 18, fat: 3, fiber: 2, sodium: 580, grams: 113 },
            "red_beans_rice": { calories: 230, protein: 9, carbs: 31, fat: 8, fiber: 4, sodium: 710, grams: 170 },
            "cajun_fries_regular": { calories: 260, protein: 3, carbs: 33, fat: 13, fiber: 2, sodium: 640, grams: 105 },
            "biscuit": { calories: 260, protein: 4, carbs: 26, fat: 15, fiber: 1, sodium: 590, grams: 68 },
        }
    },

    kfc: {
        name: "KFC",
        aliases: ["kfc", "kentucky fried chicken", "colonel"],
        items: {
            "original_chicken_breast": { calories: 390, protein: 39, carbs: 11, fat: 21, fiber: 0, sodium: 1010, grams: 161 },
            "extra_crispy_breast": { calories: 510, protein: 37, carbs: 18, fat: 33, fiber: 1, sodium: 1010, grams: 186 },
            "chicken_pot_pie": { calories: 720, protein: 28, carbs: 63, fat: 41, fiber: 4, sodium: 1650, grams: 423 },
            "famous_bowl": { calories: 710, protein: 26, carbs: 86, fat: 27, fiber: 6, sodium: 2330, grams: 453 },
            "mashed_potatoes_gravy": { calories: 130, protein: 3, carbs: 19, fat: 5, fiber: 2, sodium: 530, grams: 136 },
            "coleslaw": { calories: 140, protein: 1, carbs: 17, fat: 8, fiber: 2, sodium: 135, grams: 113 },
            "biscuit": { calories: 180, protein: 4, carbs: 22, fat: 8, fiber: 1, sodium: 530, grams: 57 },
            "corn_cob": { calories: 70, protein: 2, carbs: 13, fat: 2, fiber: 2, sodium: 0, grams: 82 },
        }
    },

    raisingcanes: {
        name: "Raising Cane's",
        aliases: ["raising canes", "cane's", "canes", "raising cane", "box combo"],
        items: {
            "3_finger_combo": { calories: 757, protein: 36, carbs: 60, fat: 42, fiber: 2, sodium: 1847, grams: 340 },
            "box_combo": { calories: 1003, protein: 46, carbs: 82, fat: 56, fiber: 3, sodium: 2467, grams: 453 },
            "caniac_combo": { calories: 1330, protein: 60, carbs: 105, fat: 74, fiber: 4, sodium: 3254, grams: 600 },
            "chicken_fingers_3": { calories: 340, protein: 31, carbs: 12, fat: 19, fiber: 0, sodium: 960, grams: 156 },
            "chicken_fingers_4": { calories: 450, protein: 42, carbs: 16, fat: 25, fiber: 0, sodium: 1280, grams: 208 },
            "crinkle_fries": { calories: 320, protein: 4, carbs: 42, fat: 15, fiber: 4, sodium: 560, grams: 130 },
            "canes_sauce": { calories: 190, protein: 0, carbs: 2, fat: 20, fiber: 0, sodium: 290, grams: 45 },
            "texas_toast": { calories: 150, protein: 4, carbs: 20, fat: 6, fiber: 1, sodium: 290, grams: 57 },
            "coleslaw": { calories: 170, protein: 1, carbs: 22, fat: 9, fiber: 2, sodium: 210, grams: 113 },
        }
    },

    // ── Mexican ───────────────────────────────────────────────

    chipotle: {
        name: "Chipotle",
        aliases: ["chipotle", "chipotle bowl", "burrito bowl", "chipotle burrito", "chipotle mexican"],
        items: {
            "chicken_burrito_bowl": { calories: 665, protein: 51, carbs: 51, fat: 23, fiber: 11, sodium: 1335, grams: 530 },
            "steak_burrito_bowl": { calories: 685, protein: 46, carbs: 51, fat: 25, fiber: 11, sodium: 1270, grams: 530 },
            "carnitas_burrito_bowl": { calories: 650, protein: 40, carbs: 51, fat: 24, fiber: 11, sodium: 1210, grams: 530 },
            "sofritas_burrito_bowl": { calories: 580, protein: 25, carbs: 62, fat: 23, fiber: 13, sodium: 1295, grams: 530 },
            "chicken_burrito": { calories: 870, protein: 51, carbs: 89, fat: 29, fiber: 9, sodium: 1760, grams: 440 },
            "steak_burrito": { calories: 890, protein: 46, carbs: 89, fat: 31, fiber: 9, sodium: 1695, grams: 440 },
            "chicken_tacos_3": { calories: 500, protein: 39, carbs: 48, fat: 17, fiber: 7, sodium: 1060, grams: 340 },
            "steak_tacos_3": { calories: 520, protein: 34, carbs: 48, fat: 19, fiber: 7, sodium: 995, grams: 340 },
            "chips_guac": { calories: 770, protein: 9, carbs: 87, fat: 44, fiber: 12, sodium: 680, grams: 300 },
            "chips_salsa": { calories: 580, protein: 7, carbs: 79, fat: 26, fiber: 8, sodium: 830, grams: 250 },
            "veggie_bowl": { calories: 540, protein: 22, carbs: 70, fat: 18, fiber: 15, sodium: 1170, grams: 510 },
            "chicken_salad": { calories: 490, protein: 44, carbs: 24, fat: 24, fiber: 11, sodium: 1155, grams: 450 },
            "queso_blanco": { calories: 120, protein: 4, carbs: 6, fat: 9, fiber: 0, sodium: 520, grams: 90 },
        }
    },

    tacobell: {
        name: "Taco Bell",
        aliases: ["taco bell", "tacobell", "crunchwrap", "chalupa", "gordita"],
        items: {
            "crunchy_taco": { calories: 170, protein: 8, carbs: 13, fat: 9, fiber: 3, sodium: 310, grams: 89 },
            "soft_taco": { calories: 180, protein: 9, carbs: 18, fat: 8, fiber: 2, sodium: 500, grams: 99 },
            "crunchwrap_supreme": { calories: 530, protein: 20, carbs: 72, fat: 20, fiber: 6, sodium: 1230, grams: 308 },
            "chalupa_supreme": { calories: 360, protein: 13, carbs: 38, fat: 18, fiber: 4, sodium: 580, grams: 153 },
            "nachos_bellgrande": { calories: 740, protein: 19, carbs: 78, fat: 38, fiber: 11, sodium: 1210, grams: 308 },
            "mexican_pizza": { calories: 540, protein: 20, carbs: 46, fat: 30, fiber: 5, sodium: 1020, grams: 216 },
            "doritos_loco_taco": { calories: 170, protein: 8, carbs: 14, fat: 9, fiber: 3, sodium: 330, grams: 89 },
            "cheesy_gordita_crunch": { calories: 500, protein: 20, carbs: 43, fat: 27, fiber: 4, sodium: 890, grams: 205 },
            "bean_burrito": { calories: 350, protein: 13, carbs: 55, fat: 9, fiber: 9, sodium: 1020, grams: 198 },
            "chicken_quesadilla": { calories: 520, protein: 28, carbs: 39, fat: 28, fiber: 3, sodium: 1240, grams: 200 },
        }
    },

    // ── Pizza ─────────────────────────────────────────────────

    dominos: {
        name: "Domino's",
        aliases: ["dominos", "domino's", "domino", "pizza delivery"],
        items: {
            "pepperoni_slice_large": { calories: 300, protein: 13, carbs: 34, fat: 12, fiber: 2, sodium: 680, grams: 105 },
            "cheese_slice_large": { calories: 260, protein: 11, carbs: 34, fat: 9, fiber: 2, sodium: 570, grams: 100 },
            "brooklyn_pepperoni_slice": { calories: 350, protein: 15, carbs: 40, fat: 14, fiber: 2, sodium: 780, grams: 125 },
            "thin_crust_pepperoni": { calories: 230, protein: 10, carbs: 23, fat: 11, fiber: 1, sodium: 550, grams: 80 },
            "pan_pizza_pepperoni": { calories: 370, protein: 14, carbs: 40, fat: 17, fiber: 2, sodium: 750, grams: 130 },
            "breadsticks_2": { calories: 180, protein: 5, carbs: 28, fat: 6, fiber: 1, sodium: 380, grams: 90 },
            "cheesy_bread_2": { calories: 210, protein: 7, carbs: 28, fat: 8, fiber: 1, sodium: 440, grams: 90 },
            "pasta_bowl_chicken": { calories: 730, protein: 34, carbs: 98, fat: 20, fiber: 5, sodium: 1650, grams: 453 },
            "chicken_wings_8": { calories: 560, protein: 46, carbs: 4, fat: 40, fiber: 0, sodium: 1760, grams: 280 },
            "lava_cake": { calories: 360, protein: 3, carbs: 55, fat: 13, fiber: 2, sodium: 330, grams: 113 },
        }
    },

    pizzahut: {
        name: "Pizza Hut",
        aliases: ["pizza hut", "pizzahut", "hut"],
        items: {
            "pepperoni_slice_medium": { calories: 290, protein: 13, carbs: 35, fat: 11, fiber: 2, sodium: 680, grams: 108 },
            "cheese_slice_medium": { calories: 250, protein: 11, carbs: 35, fat: 8, fiber: 2, sodium: 520, grams: 100 },
            "supreme_slice_medium": { calories: 320, protein: 14, carbs: 35, fat: 14, fiber: 2, sodium: 760, grams: 118 },
            "thin_crust_pepperoni": { calories: 210, protein: 10, carbs: 22, fat: 9, fiber: 1, sodium: 560, grams: 75 },
            "pan_pepperoni_slice": { calories: 340, protein: 13, carbs: 36, fat: 16, fiber: 2, sodium: 690, grams: 120 },
            "breadsticks_2": { calories: 340, protein: 9, carbs: 52, fat: 11, fiber: 2, sodium: 560, grams: 134 },
            "wing_4": { calories: 260, protein: 21, carbs: 1, fat: 19, fiber: 0, sodium: 710, grams: 100 },
        }
    },

    // ── Sandwich / Sub ────────────────────────────────────────

    subway: {
        name: "Subway",
        aliases: ["subway", "subway sandwich", "footlong", "6 inch"],
        items: {
            "6in_turkey": { calories: 280, protein: 18, carbs: 40, fat: 4, fiber: 3, sodium: 690, grams: 218 },
            "footlong_turkey": { calories: 560, protein: 36, carbs: 80, fat: 8, fiber: 6, sodium: 1380, grams: 436 },
            "6in_chicken": { calories: 310, protein: 23, carbs: 41, fat: 5, fiber: 3, sodium: 610, grams: 231 },
            "footlong_chicken": { calories: 620, protein: 46, carbs: 82, fat: 10, fiber: 6, sodium: 1220, grams: 462 },
            "6in_bmt": { calories: 360, protein: 19, carbs: 36, fat: 15, fiber: 3, sodium: 1350, grams: 196 },
            "footlong_bmt": { calories: 720, protein: 38, carbs: 72, fat: 30, fiber: 6, sodium: 2700, grams: 392 },
            "6in_tuna": { calories: 480, protein: 20, carbs: 36, fat: 26, fiber: 3, sodium: 640, grams: 245 },
            "6in_veggie": { calories: 230, protein: 9, carbs: 44, fat: 3, fiber: 5, sodium: 500, grams: 203 },
            "6in_steak_cheese": { calories: 380, protein: 24, carbs: 40, fat: 13, fiber: 3, sodium: 900, grams: 245 },
            "cookie": { calories: 210, protein: 2, carbs: 30, fat: 10, fiber: 1, sodium: 150, grams: 45 },
        }
    },

    jerseymikes: {
        name: "Jersey Mike's",
        aliases: ["jersey mikes", "jersey mike's", "jersey mike", "mikes sub"],
        items: {
            "regular_turkey": { calories: 500, protein: 30, carbs: 56, fat: 16, fiber: 3, sodium: 1640, grams: 280 },
            "giant_turkey": { calories: 1000, protein: 60, carbs: 112, fat: 32, fiber: 6, sodium: 3280, grams: 560 },
            "regular_italian": { calories: 660, protein: 28, carbs: 54, fat: 36, fiber: 3, sodium: 2180, grams: 300 },
            "regular_club": { calories: 560, protein: 32, carbs: 54, fat: 22, fiber: 3, sodium: 1840, grams: 290 },
            "regular_philly": { calories: 650, protein: 38, carbs: 56, fat: 28, fiber: 3, sodium: 1920, grams: 310 },
        }
    },

    // ── Coffee / Breakfast ────────────────────────────────────

    starbucks: {
        name: "Starbucks",
        aliases: ["starbucks", "frappuccino", "starbucks coffee", "sbux", "venti", "grande"],
        items: {
            "grande_latte": { calories: 190, protein: 13, carbs: 19, fat: 7, fiber: 0, sodium: 170, grams: 473 },
            "venti_latte": { calories: 250, protein: 17, carbs: 25, fat: 9, fiber: 0, sodium: 220, grams: 709 },
            "grande_frappuccino": { calories: 380, protein: 5, carbs: 65, fat: 13, fiber: 0, sodium: 230, grams: 473 },
            "grande_cold_brew": { calories: 30, protein: 1, carbs: 5, fat: 0, fiber: 0, sodium: 15, grams: 473 },
            "grande_matcha_latte": { calories: 240, protein: 12, carbs: 35, fat: 7, fiber: 0, sodium: 170, grams: 473 },
            "grande_caramel_macchiato": { calories: 250, protein: 10, carbs: 33, fat: 7, fiber: 0, sodium: 150, grams: 473 },
            "egg_bites_bacon": { calories: 310, protein: 19, carbs: 13, fat: 21, fiber: 0, sodium: 470, grams: 170 },
            "cheese_danish": { calories: 290, protein: 5, carbs: 34, fat: 15, fiber: 1, sodium: 330, grams: 100 },
            "turkey_sandwich": { calories: 430, protein: 22, carbs: 52, fat: 14, fiber: 4, sodium: 900, grams: 229 },
            "banana_bread": { calories: 420, protein: 6, carbs: 75, fat: 11, fiber: 2, sodium: 330, grams: 133 },
            "impossible_breakfast_sandwich": { calories: 430, protein: 25, carbs: 47, fat: 16, fiber: 3, sodium: 760, grams: 213 },
        }
    },

    dunkin: {
        name: "Dunkin'",
        aliases: ["dunkin", "dunkin donuts", "dunkin'"],
        items: {
            "glazed_donut": { calories: 260, protein: 3, carbs: 33, fat: 13, fiber: 1, sodium: 320, grams: 60 },
            "boston_cream_donut": { calories: 300, protein: 4, carbs: 41, fat: 14, fiber: 1, sodium: 280, grams: 80 },
            "chocolate_frosted": { calories: 290, protein: 3, carbs: 35, fat: 15, fiber: 1, sodium: 290, grams: 65 },
            "bacon_egg_cheese_bagel": { calories: 560, protein: 25, carbs: 68, fat: 19, fiber: 3, sodium: 1110, grams: 255 },
            "medium_hot_coffee": { calories: 5, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 5, grams: 473 },
            "medium_iced_latte": { calories: 120, protein: 6, carbs: 15, fat: 4, fiber: 0, sodium: 95, grams: 473 },
            "munchkins_5": { calories: 210, protein: 2, carbs: 29, fat: 10, fiber: 0, sodium: 270, grams: 72 },
            "hash_browns": { calories: 130, protein: 1, carbs: 15, fat: 7, fiber: 1, sodium: 290, grams: 57 },
        }
    },

    // ── Fast Casual ───────────────────────────────────────────

    panera: {
        name: "Panera Bread",
        aliases: ["panera", "panera bread", "you pick two"],
        items: {
            "broccoli_cheddar_soup_bowl": { calories: 360, protein: 14, carbs: 32, fat: 20, fiber: 4, sodium: 1010, grams: 340 },
            "broccoli_cheddar_bread_bowl": { calories: 780, protein: 30, carbs: 108, fat: 25, fiber: 8, sodium: 1800, grams: 600 },
            "chicken_noodle_soup": { calories: 110, protein: 8, carbs: 15, fat: 2, fiber: 1, sodium: 1050, grams: 340 },
            "fuji_apple_salad": { calories: 570, protein: 36, carbs: 46, fat: 26, fiber: 6, sodium: 1000, grams: 387 },
            "turkey_sandwich": { calories: 580, protein: 35, carbs: 64, fat: 18, fiber: 4, sodium: 1700, grams: 314 },
            "grilled_cheese": { calories: 670, protein: 28, carbs: 64, fat: 33, fiber: 3, sodium: 1610, grams: 300 },
            "bagel_plain": { calories: 290, protein: 10, carbs: 59, fat: 1, fiber: 2, sodium: 500, grams: 132 },
            "mac_and_cheese": { calories: 500, protein: 18, carbs: 66, fat: 18, fiber: 3, sodium: 1050, grams: 340 },
            "chocolate_chip_cookie": { calories: 440, protein: 5, carbs: 62, fat: 21, fiber: 2, sodium: 290, grams: 113 },
        }
    },

    pandaexpress: {
        name: "Panda Express",
        aliases: ["panda express", "panda", "orange chicken", "beijing beef"],
        items: {
            "orange_chicken": { calories: 490, protein: 25, carbs: 51, fat: 22, fiber: 0, sodium: 820, grams: 244 },
            "beijing_beef": { calories: 690, protein: 26, carbs: 57, fat: 40, fiber: 3, sodium: 890, grams: 295 },
            "kung_pao_chicken": { calories: 290, protein: 23, carbs: 22, fat: 12, fiber: 4, sodium: 970, grams: 236 },
            "honey_walnut_shrimp": { calories: 360, protein: 14, carbs: 35, fat: 19, fiber: 1, sodium: 470, grams: 170 },
            "broccoli_beef": { calories: 150, protein: 9, carbs: 13, fat: 7, fiber: 2, sodium: 710, grams: 160 },
            "teriyaki_chicken": { calories: 300, protein: 36, carbs: 13, fat: 11, fiber: 0, sodium: 520, grams: 236 },
            "fried_rice": { calories: 530, protein: 11, carbs: 82, fat: 16, fiber: 2, sodium: 850, grams: 373 },
            "chow_mein": { calories: 510, protein: 13, carbs: 80, fat: 15, fiber: 6, sodium: 980, grams: 341 },
            "super_greens": { calories: 90, protein: 6, carbs: 13, fat: 2, fiber: 5, sodium: 370, grams: 213 },
            "steamed_white_rice": { calories: 380, protein: 7, carbs: 84, fat: 0, fiber: 0, sodium: 0, grams: 396 },
        }
    },

    sweetgreen: {
        name: "Sweetgreen",
        aliases: ["sweetgreen", "sweet green"],
        items: {
            "harvest_bowl": { calories: 705, protein: 34, carbs: 73, fat: 30, fiber: 10, sodium: 1045, grams: 500 },
            "guacamole_greens": { calories: 465, protein: 14, carbs: 37, fat: 30, fiber: 10, sodium: 760, grams: 400 },
            "shroomami": { calories: 555, protein: 19, carbs: 73, fat: 22, fiber: 10, sodium: 1155, grams: 480 },
            "chicken_pesto_parm": { calories: 645, protein: 47, carbs: 47, fat: 30, fiber: 6, sodium: 1160, grams: 460 },
            "super_green_goddess": { calories: 505, protein: 25, carbs: 41, fat: 28, fiber: 9, sodium: 890, grams: 420 },
        }
    },

    cava: {
        name: "CAVA",
        aliases: ["cava", "cava grill", "cava bowl", "cava mediterranean"],
        items: {
            "grain_bowl_chicken": { calories: 680, protein: 40, carbs: 68, fat: 26, fiber: 8, sodium: 1240, grams: 500 },
            "greens_bowl_chicken": { calories: 490, protein: 38, carbs: 28, fat: 24, fiber: 8, sodium: 1080, grams: 420 },
            "pita_chicken": { calories: 690, protein: 36, carbs: 76, fat: 25, fiber: 5, sodium: 1380, grams: 460 },
            "falafel_bowl": { calories: 720, protein: 22, carbs: 84, fat: 32, fiber: 12, sodium: 1320, grams: 520 },
        }
    },

    // ── Italian ───────────────────────────────────────────────

    olivegarden: {
        name: "Olive Garden",
        aliases: ["olive garden", "olivegarden", "never ending pasta"],
        items: {
            "spaghetti_marinara": { calories: 630, protein: 22, carbs: 100, fat: 14, fiber: 8, sodium: 980, grams: 480 },
            "fettuccine_alfredo": { calories: 1200, protein: 41, carbs: 137, fat: 57, fiber: 6, sodium: 1800, grams: 620 },
            "chicken_alfredo": { calories: 1440, protein: 64, carbs: 137, fat: 75, fiber: 6, sodium: 2290, grams: 700 },
            "chicken_parmigiana": { calories: 1060, protein: 75, carbs: 78, fat: 47, fiber: 8, sodium: 3380, grams: 580 },
            "tour_of_italy": { calories: 1440, protein: 68, carbs: 102, fat: 83, fiber: 8, sodium: 3830, grams: 680 },
            "breadstick": { calories: 140, protein: 5, carbs: 26, fat: 2, fiber: 1, sodium: 460, grams: 45 },
            "minestrone_soup": { calories: 110, protein: 5, carbs: 18, fat: 1, fiber: 5, sodium: 1020, grams: 227 },
            "tiramisu": { calories: 470, protein: 7, carbs: 59, fat: 23, fiber: 0, sodium: 200, grams: 170 },
        }
    },

    // ── Breakfast ─────────────────────────────────────────────

    ihop: {
        name: "IHOP",
        aliases: ["ihop", "i hop", "international house of pancakes"],
        items: {
            "original_buttermilk_pancakes_short": { calories: 430, protein: 9, carbs: 68, fat: 14, fiber: 2, sodium: 970, grams: 280 },
            "original_buttermilk_pancakes_full": { calories: 820, protein: 16, carbs: 128, fat: 26, fiber: 4, sodium: 1820, grams: 540 },
            "2_egg_breakfast": { calories: 390, protein: 20, carbs: 29, fat: 22, fiber: 2, sodium: 960, grams: 280 },
            "colorado_omelette": { calories: 750, protein: 45, carbs: 12, fat: 59, fiber: 2, sodium: 1620, grams: 430 },
            "french_toast_combo": { calories: 680, protein: 22, carbs: 89, fat: 27, fiber: 4, sodium: 1180, grams: 420 },
            "belgian_waffle": { calories: 580, protein: 10, carbs: 77, fat: 26, fiber: 2, sodium: 830, grams: 310 },
        }
    },

    crackerbarrel: {
        name: "Cracker Barrel",
        aliases: ["cracker barrel", "crackerbarrel", "cracker barrel old country"],
        items: {
            "country_fried_steak": { calories: 890, protein: 38, carbs: 68, fat: 50, fiber: 3, sodium: 2780, grams: 450 },
            "chicken_and_dumplings": { calories: 530, protein: 28, carbs: 62, fat: 18, fiber: 3, sodium: 1840, grams: 400 },
            "meatloaf": { calories: 580, protein: 34, carbs: 40, fat: 30, fiber: 2, sodium: 1490, grams: 380 },
            "pancakes_3": { calories: 530, protein: 11, carbs: 86, fat: 16, fiber: 2, sodium: 1210, grams: 340 },
            "biscuit": { calories: 160, protein: 4, carbs: 24, fat: 6, fiber: 1, sodium: 430, grams: 55 },
            "corn_muffin": { calories: 210, protein: 4, carbs: 34, fat: 7, fiber: 1, sodium: 330, grams: 75 },
        }
    },

    // ── Asian Fast Casual ─────────────────────────────────────

    pf_changs: {
        name: "P.F. Chang's",
        aliases: ["pf changs", "p.f. chang's", "pf chang", "chang's"],
        items: {
            "mongolian_beef": { calories: 770, protein: 40, carbs: 70, fat: 33, fiber: 2, sodium: 2090, grams: 450 },
            "orange_peel_chicken": { calories: 790, protein: 36, carbs: 95, fat: 27, fiber: 3, sodium: 1640, grams: 460 },
            "kung_pao_shrimp": { calories: 440, protein: 28, carbs: 40, fat: 18, fiber: 4, sodium: 1580, grams: 380 },
            "fried_rice": { calories: 780, protein: 24, carbs: 118, fat: 22, fiber: 4, sodium: 1820, grams: 520 },
            "lettuce_wraps": { calories: 380, protein: 26, carbs: 32, fat: 16, fiber: 4, sodium: 1200, grams: 340 },
            "spring_rolls_2": { calories: 190, protein: 6, carbs: 22, fat: 8, fiber: 2, sodium: 430, grams: 110 },
        }
    },

};

// ── Restaurant detection ──────────────────────────────────────

export function detectRestaurant(mealDescription, foods = []) {
    const text = (mealDescription + ' ' + foods.map(f => f.label + ' ' + (f.display_name || '')).join(' ')).toLowerCase();

    for (const [key, restaurant] of Object.entries(RESTAURANT_DB)) {
        for (const alias of restaurant.aliases) {
            if (text.includes(alias.toLowerCase())) {
                console.log(`[RestaurantDB] Text detected: ${restaurant.name}`);
                return key;
            }
        }
    }
    return null;
}

export function matchMenuItem(restaurantKey, foodLabel, displayName = '') {
    const restaurant = RESTAURANT_DB[restaurantKey];
    if (!restaurant) return null;

    const searchText = (foodLabel + ' ' + displayName).toLowerCase().replace(/_/g, ' ');

    // Exact match first
    for (const [itemKey, item] of Object.entries(restaurant.items)) {
        const itemName = itemKey.replace(/_/g, ' ');
        if (searchText.includes(itemName) || itemName.includes(searchText)) {
            return { ...item, name: itemKey.replace(/_/g, ' '), restaurant: restaurant.name };
        }
    }

    // Partial word match — require at least 2 matching words
    for (const [itemKey, item] of Object.entries(restaurant.items)) {
        const itemWords = itemKey.replace(/_/g, ' ').split(' ').filter(w => w.length > 3);
        const matchCount = itemWords.filter(w => searchText.includes(w)).length;
        if (matchCount >= 2) {
            return { ...item, name: itemKey.replace(/_/g, ' '), restaurant: restaurant.name };
        }
    }

    return null;
}
